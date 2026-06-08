import type { ContainerEngine, Database, ServiceName } from "@/types/models";

export type ComposeImportSecret = {
  key: string;
  label: string;
  value: string;
};

export type ComposeImportCandidate = Omit<Database, "id"> & {
  composeService: string;
  image: string;
  passwordSource?: string;
};

const SERVICE_IMAGE_MATCHERS: Array<[ServiceName, RegExp, string]> = [
  ["PostgreSQL", /(^|[\/:])postgres(?:ql)?([:\/@]|$)/i, "5432"],
  ["MariaDB", /(^|[\/:])mariadb([:\/@]|$)/i, "3306"],
  ["MySQL", /(^|[\/:])mysql([:\/@]|$)/i, "3306"],
  ["Redis", /(^|[\/:])redis([:\/@]|$)/i, "6379"],
];

const PASSWORD_KEYS: Partial<Record<ServiceName, string[]>> = {
  PostgreSQL: ["POSTGRES_PASSWORD", "POSTGRESQL_PASSWORD", "PGPASSWORD"],
  MySQL: ["MYSQL_ROOT_PASSWORD", "MYSQL_PASSWORD"],
  MariaDB: ["MARIADB_ROOT_PASSWORD", "MYSQL_ROOT_PASSWORD", "MARIADB_PASSWORD"],
  Redis: ["REDIS_PASSWORD", "REDIS_ARGS"],
};

export function parseDockerComposeDatabases(
  composeText: string,
  opts: {
    engine: ContainerEngine;
    existingDatabases: Array<Pick<Database, "name" | "port">>;
    categoryIds?: string[];
  },
): { candidates: ComposeImportCandidate[]; secrets: ComposeImportSecret[]; warnings: string[] } {
  const services = parseServices(composeText);
  const warnings: string[] = [];
  const secretByKey = new Map<string, ComposeImportSecret>();
  const usedPorts = new Set(opts.existingDatabases.map((db) => Number(db.port)).filter(Number.isFinite));
  const usedNames = new Set(opts.existingDatabases.map((db) => db.name.toLowerCase()));

  const candidates = services.flatMap((svc) => {
    const serviceInfo = detectService(svc.image);
    if (!serviceInfo) return [];

    const [service, , defaultPort] = serviceInfo;
    const password = resolvePassword(service, svc.env);
    let passwordValue = password.value;
    let passwordSource = password.source;

    if (password.needsInput) {
      const secretKey = `${svc.name}:${password.source}`;
      if (!secretByKey.has(secretKey)) {
        secretByKey.set(secretKey, {
          key: secretKey,
          label: `${svc.name} • ${password.source}`,
          value: "",
        });
      }
      passwordValue = `{{${secretKey}}}`;
    }

    const portMapping = choosePortMapping(svc.ports, defaultPort, usedPorts);
    usedPorts.add(Number(portMapping.hostPort));
    const name = uniqueName(humanName(svc.name), usedNames);
    usedNames.add(name.toLowerCase());

    return [{
      composeService: svc.name,
      image: svc.image,
      containerId: svc.containerName,
      engine: opts.engine,
      name,
      service,
      version: imageTag(svc.image),
      port: portMapping.hostPort,
      containerPort: portMapping.containerPort,
      password: passwordValue,
      passwordSource,
      categoryIds: opts.categoryIds ?? [],
    }];
  });

  if (services.length === 0) warnings.push("No services block was found. Paste a Docker Compose YAML file.");
  if (candidates.length === 0 && services.length > 0) {
    warnings.push("No supported database images were found. DockBricks supports PostgreSQL, MySQL, MariaDB, and Redis.");
  }

  return { candidates, secrets: [...secretByKey.values()], warnings };
}

export function applyComposeSecrets(
  candidates: ComposeImportCandidate[],
  secrets: ComposeImportSecret[],
): ComposeImportCandidate[] {
  const values = new Map(secrets.map((secret) => [secret.key, secret.value]));
  return candidates.map((candidate) => ({
    ...candidate,
    password: candidate.password.replace(/\{\{([^}]+)\}\}/g, (_match, key) => values.get(key) ?? ""),
  }));
}

type ParsedService = {
  name: string;
  image: string;
  containerName?: string;
  ports: string[];
  env: Record<string, string>;
};

function parseServices(text: string): ParsedService[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const servicesIndex = lines.findIndex((line) => /^services:\s*$/.test(line.trim()));
  if (servicesIndex === -1) return [];

  const services: ParsedService[] = [];
  let current: ParsedService | null = null;
  let mode: "ports" | "environment" | null = null;
  let pendingPort: { target?: string; published?: string } | null = null;

  for (let i = servicesIndex + 1; i < lines.length; i += 1) {
    const raw = stripComment(lines[i]);
    if (!raw.trim()) continue;
    const indent = raw.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = raw.trim();

    if (indent <= 0) break;
    const serviceMatch = raw.match(/^\s{2}([A-Za-z0-9_.-]+):\s*$/);
    if (serviceMatch) {
      current = { name: serviceMatch[1], image: "", ports: [], env: {} };
      services.push(current);
      mode = null;
      pendingPort = null;
      continue;
    }
    if (!current) continue;

    const prop = trimmed.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (indent === 4 && prop) {
      mode = null;
      const key = prop[1];
      const value = unquote(prop[2]);
      if (key === "image") current.image = value;
      if (key === "container_name") current.containerName = value;
      if (key === "ports") {
        mode = "ports";
        pendingPort = null;
        const service = current;
        parseInlineList(value).forEach((entry) => service.ports.push(entry));
      }
      if (key === "environment") {
        mode = "environment";
        const service = current;
        parseInlineList(value).forEach((entry) => addEnvironmentEntry(service, entry));
      }
      continue;
    }

    if (mode === "ports") {
      const item = trimmed.replace(/^-\s*/, "");
      const longPort = item.match(/^(target|published)\s*:\s*(.*)$/);
      if (longPort) {
        pendingPort ??= {};
        pendingPort[longPort[1] as "target" | "published"] = unquote(longPort[2]);
        if (pendingPort.target && pendingPort.published) {
          current.ports.push(`${pendingPort.published}:${pendingPort.target}`);
          pendingPort = null;
        }
      } else if (item) {
        current.ports.push(unquote(item));
        pendingPort = null;
      }
    }
    if (mode === "environment") {
      const item = trimmed.replace(/^-\s*/, "");
      addEnvironmentEntry(current, item);
    }
  }

  return services.filter((service) => service.image);
}

function stripComment(line: string): string {
  return line.replace(/\s+#.*$/, "");
}

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function parseInlineList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];

  return trimmed
    .slice(1, -1)
    .split(/,(?![^{}]*\})/)
    .map((entry) => unquote(entry.trim()))
    .filter(Boolean)
    .map((entry) => parseInlinePortObject(entry) ?? entry);
}

function parseInlinePortObject(entry: string): string | null {
  const target = entry.match(/target\s*:\s*['"]?(\d+)['"]?/i)?.[1];
  const published = entry.match(/published\s*:\s*['"]?(\d+)['"]?/i)?.[1];
  return target && published ? `${published}:${target}` : null;
}

function addEnvironmentEntry(service: ParsedService, item: string) {
  const cleanItem = unquote(item);
  const envMatch = cleanItem.match(/^([A-Za-z_][\w]*)(?:\s*[:=]\s*)(.*)$/);
  if (envMatch) {
    service.env[envMatch[1]] = unquote(envMatch[2]);
    return;
  }

  if (/^[A-Za-z_][\w]*$/.test(cleanItem)) {
    service.env[cleanItem] = `\${${cleanItem}}`;
  }
}

function detectService(image: string) {
  return SERVICE_IMAGE_MATCHERS.find(([, matcher]) => matcher.test(image));
}

function imageTag(image: string): string {
  const last = image.split("/").pop() ?? image;
  const tag = last.includes(":") ? last.split(":").pop() : "latest";
  return tag || "latest";
}

function resolvePassword(service: ServiceName, env: Record<string, string>) {
  const keys = PASSWORD_KEYS[service] ?? [];
  for (const key of keys) {
    const value = env[key];
    if (!value) continue;
    if (/^\$\{[^}]+\}$/.test(value)) {
      return { value: "", source: key, needsInput: true };
    }
    if (service === "Redis" && key === "REDIS_ARGS") {
      const match = value.match(/--requirepass\s+(\S+)/);
      if (match) return { value: match[1], source: key, needsInput: false };
    }
    return { value, source: key, needsInput: false };
  }
  return { value: service === "PostgreSQL" ? "postgres" : "", source: keys[0] ?? "PASSWORD", needsInput: false };
}

function choosePortMapping(
  ports: string[],
  defaultPort: string,
  usedPorts: Set<number>,
): { hostPort: string; containerPort: string } {
  const mapped = ports.map((port) => port.split(":").map((part) => part.trim()).filter(Boolean));
  const found = mapped.find((parts) => parts[parts.length - 1]?.replace(/\/tcp$/, "") === defaultPort);
  const rawHostPort = found && found.length > 1 ? found[found.length - 2] : defaultPort;
  let hostPort = Number(rawHostPort);
  if (!Number.isFinite(hostPort)) hostPort = Number(defaultPort);
  while (usedPorts.has(hostPort)) hostPort += 1;

  return {
    hostPort: String(hostPort),
    containerPort: found?.[found.length - 1]?.replace(/\/tcp$/, "") || defaultPort,
  };
}

function humanName(name: string): string {
  return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function uniqueName(name: string, usedNames: Set<string>): string {
  let candidate = name;
  let index = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${name} ${index}`;
    index += 1;
  }
  return candidate;
}
