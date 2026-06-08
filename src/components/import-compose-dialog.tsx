import * as React from "react";
import { FileCodeIcon, KeyRoundIcon, PencilIcon, UploadIcon, XIcon } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ServiceIcon } from "@/components/databases/service-icon";
import {
  applyComposeSecrets,
  parseDockerComposeDatabases,
  type ComposeImportSecret,
} from "@/lib/docker-compose-import";
import type { Category, ContainerEngine, Database } from "@/types/models";

type ImportComposeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  selectedCategory: string | null;
  existingDatabases: Database[];
  defaultEngine: ContainerEngine;
  onImport: (databases: Omit<Database, "id" | "containerId">[]) => void;
};

export function ImportComposeDialog({
  open,
  onOpenChange,
  categories,
  selectedCategory,
  existingDatabases,
  defaultEngine,
  onImport,
}: ImportComposeDialogProps) {
  const [composeText, setComposeText] = React.useState("");
  const [secrets, setSecrets] = React.useState<ComposeImportSecret[]>([]);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [editingYaml, setEditingYaml] = React.useState(true);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const selectedCategoryIds = selectedCategory ? [selectedCategory] : [];
  const parsed = React.useMemo(
    () =>
      parseDockerComposeDatabases(composeText, {
        engine: defaultEngine,
        existingDatabases,
        categoryIds: selectedCategoryIds,
      }),
    [composeText, defaultEngine, existingDatabases, selectedCategory],
  );

  React.useEffect(() => {
    setSecrets((prev) =>
      parsed.secrets.map((secret) => ({
        ...secret,
        value: prev.find((item) => item.key === secret.key)?.value ?? "",
      })),
    );
  }, [parsed.secrets.map((secret) => secret.key).join("|")]);

  function reset() {
    setComposeText("");
    setSecrets([]);
    setFileName(null);
    setFileError(null);
    setEditingYaml(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileUpload(file: File | null) {
    if (!file) return;

    setFileError(null);
    const lowerName = file.name.toLowerCase();
    const looksLikeCompose =
      lowerName.endsWith(".yml") ||
      lowerName.endsWith(".yaml") ||
      lowerName.includes("compose") ||
      lowerName.includes("docker-compose");

    if (!looksLikeCompose) {
      setFileError("That doesn’t look like a Compose YAML file. You can still paste it manually below.");
      return;
    }

    try {
      const text = await file.text();
      setComposeText(text);
      setFileName(file.name);
      setEditingYaml(false);
    } catch (error) {
      setFileError(`Could not read file: ${String(error)}`);
    }
  }

  function handleImport() {
    const candidates = applyComposeSecrets(parsed.candidates, secrets);
    onImport(
      candidates.map(({ composeService, image, passwordSource, containerId, ...db }) => db),
    );
    reset();
    onOpenChange(false);
  }

  const missingSecrets = secrets.some((secret) => !secret.value.trim());
  const canImport = parsed.candidates.length > 0 && !missingSecrets;
  const hasComposeText = composeText.trim().length > 0;
  const categoryName = selectedCategory
    ? categories.find((category) => category.id === selectedCategory)?.name
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) reset();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="grid max-h-[86vh] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
              <FileCodeIcon className="size-4 text-muted-foreground" />
            </span>
            <div>
              <DialogTitle className="text-base">Import Docker Compose</DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Paste or upload compose YAML. Secrets stay local.
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(86vh-8.75rem)]">
          <div className="flex flex-col gap-4 px-5 py-4">
          <TooltipProvider delayDuration={250}>
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Label htmlFor="compose-file" className="text-sm">Compose source</Label>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {hasComposeText
                      ? `${fileName ?? "Pasted YAML"} • ${composeText.split("\n").length} lines`
                      : "Upload a file or paste YAML below"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Input
                    ref={fileInputRef}
                    id="compose-file"
                    type="file"
                    accept=".yml,.yaml,text/yaml,text/x-yaml,application/x-yaml"
                    onChange={(event) => void handleFileUpload(event.target.files?.[0] ?? null)}
                    className="hidden"
                  />

                  {hasComposeText && !editingYaml && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingYaml(true)}>
                          <PencilIcon className="size-3.5" />
                          Edit YAML
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit the imported compose text</TooltipContent>
                    </Tooltip>
                  )}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant={hasComposeText ? "secondary" : "default"}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <UploadIcon className="size-3.5" />
                        {hasComposeText ? "Replace" : "Upload file"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{hasComposeText ? "Choose another compose file" : "Choose a .yml or .yaml compose file"}</TooltipContent>
                  </Tooltip>

                  {hasComposeText && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setComposeText("");
                            setFileName(null);
                            setEditingYaml(true);
                          }}
                        >
                          <XIcon className="size-3.5" />
                          Clear
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Clear the current compose source</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
              {fileError && <p className="mt-2 text-xs text-destructive">{fileError}</p>}
            </div>
          </TooltipProvider>

          {(!hasComposeText || editingYaml) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="compose-yaml" className="text-sm">YAML</Label>
              <Textarea
                id="compose-yaml"
                value={composeText}
                onChange={(event) => setComposeText(event.target.value)}
                onPaste={() => window.setTimeout(() => setEditingYaml(false), 0)}
                placeholder={`services:\n  db:\n    image: postgres:17\n    ports:\n      - "5432:5432"\n    environment:\n      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}`}
                className="min-h-36 resize-y font-mono text-xs leading-5"
                autoFocus
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Detects PostgreSQL, MySQL, MariaDB, Redis, ports, names, and env secrets.
                </p>
                {hasComposeText && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditingYaml(false)}>
                    Done editing
                  </Button>
                )}
              </div>
            </div>
          )}

          {parsed.warnings.map((warning) => (
            <div key={warning} className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {warning}
            </div>
          ))}

          {parsed.candidates.length > 0 && (
            <div className="rounded-xl border p-3 text-left">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Preview</span>
                <span className="text-xs text-muted-foreground">{parsed.candidates.length} found{categoryName ? ` • ${categoryName}` : ""}</span>
              </div>
              <div className="space-y-1.5">
                {parsed.candidates.map((candidate) => (
                  <div key={candidate.composeService} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-2.5 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <ServiceIcon service={candidate.service} className="size-4 shrink-0" />
                      <span className="truncate font-medium">{candidate.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{candidate.service} {candidate.version}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">:{candidate.port}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {secrets.length > 0 && (
            <div className="rounded-xl border p-3 text-left">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <KeyRoundIcon className="size-3.5" />
                Secrets
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {secrets.map((secret) => (
                  <div key={secret.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`secret-${secret.key}`} className="truncate text-xs">{secret.label}</Label>
                    <Input
                      id={`secret-${secret.key}`}
                      type="password"
                      value={secret.value}
                      onChange={(event) =>
                        setSecrets((prev) =>
                          prev.map((item) =>
                            item.key === secret.key ? { ...item, value: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Enter password"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t bg-background/95 px-5 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleImport} disabled={!canImport}>Import {parsed.candidates.length || ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
