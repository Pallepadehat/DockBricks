import * as React from "react"
import {
  DatabaseIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  Loader2Icon,
  AlertTriangleIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Category } from "./app-sidebar"

// ── Service definitions ───────────────────────────────────────────────────────

const SERVICES = {
  MariaDB: {
    defaultPort: "3306",
    versions: ["11.x (Latest)", "10.11 LTS", "10.6 LTS", "10.5"],
  },
  MySQL: {
    defaultPort: "3306",
    versions: ["8.4 (Latest)", "8.0 LTS", "5.7"],
  },
  PostgreSQL: {
    defaultPort: "5432",
    versions: ["17.x (Latest)", "16.x", "15.x", "14.x", "13.x"],
  },
  Redis: {
    defaultPort: "6379",
    versions: ["7.x (Latest)", "6.x", "5.x"],
  },
} as const

type ServiceName = keyof typeof SERVICES

// ── Public types ──────────────────────────────────────────────────────────────

export type Database = {
  id: string
  containerId?: string
  name: string
  service: ServiceName
  version: string
  port: string
  password: string
  categoryIds: string[]
}

type CreateDatabaseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  onSave: (db: Omit<Database, "id" | "containerId">) => Promise<void>
  isCreating?: boolean
  createError?: string | null
  dockerRunning?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateDatabaseDialog({
  open,
  onOpenChange,
  categories,
  onSave,
  isCreating = false,
  createError = null,
  dockerRunning = true,
}: CreateDatabaseDialogProps) {
  const [name, setName] = React.useState("")
  const [service, setService] = React.useState<ServiceName | "">("")
  const [version, setVersion] = React.useState("")
  const [port, setPort] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>([])

  function handleServiceChange(value: string) {
    const svc = value as ServiceName
    setService(svc)
    setVersion("")
    setPort(SERVICES[svc].defaultPort)
  }

  function toggleCategory(id: string) {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  async function handleSave() {
    if (!name.trim() || !service || !version) return
    await onSave({
      name: name.trim(),
      service: service as ServiceName,
      version,
      port,
      password,
      categoryIds: selectedCategories,
    })
    // Dialog close and form reset happen in App.tsx on success
  }

  function resetForm() {
    setName("")
    setService("")
    setVersion("")
    setPort("")
    setPassword("")
    setShowPassword(false)
    setSelectedCategories([])
  }

  const canSave = !isCreating && name.trim() && service && version && dockerRunning

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DatabaseIcon className="size-4 text-muted-foreground" />
            <DialogTitle>Create Database</DialogTitle>
          </div>
        </DialogHeader>

        {/* Docker not running warning */}
        {!dockerRunning && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
            <AlertTriangleIcon className="size-3.5 shrink-0" />
            <span>Docker is not running. Start Docker to create a database.</span>
          </div>
        )}

        {/* Error from the last create attempt */}
        {createError && (
          <div className="flex flex-col gap-0.5 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
            <span className="font-medium">Failed to create container</span>
            <span className="text-destructive/70 break-all">{createError}</span>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="db-name">Name</Label>
            <Input
              id="db-name"
              placeholder="My database"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={isCreating}
            />
          </div>

          {/* Service + Version */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="db-service">Service</Label>
              <Select
                value={service}
                onValueChange={handleServiceChange}
                disabled={isCreating}
              >
                <SelectTrigger id="db-service" className="w-full">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(SERVICES).map((svc) => (
                    <SelectItem key={svc} value={svc}>
                      {svc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="db-version">Version</Label>
              <Select
                value={version}
                onValueChange={setVersion}
                disabled={!service || isCreating}
              >
                <SelectTrigger id="db-version" className="w-full">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {service &&
                    SERVICES[service as ServiceName].versions.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Port + Password */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="db-port">Port</Label>
              <Input
                id="db-port"
                placeholder="3306"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                disabled={isCreating}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="db-password">Password</Label>
              <div className="relative">
                <Input
                  id="db-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-9"
                  disabled={isCreating}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  disabled={isCreating}
                >
                  {showPassword ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Docker image preview */}
          {service && version && (
            <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground font-mono">
              <DatabaseIcon className="size-3.5 shrink-0" />
              <span className="truncate">
                {resolveImagePreview(service as ServiceName, version)}
              </span>
            </div>
          )}

          {/* Categories */}
          {categories.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Categories</Label>
              <div className="flex flex-col gap-1.5">
                {categories.map((cat) => (
                  <label
                    key={cat.id}
                    htmlFor={`cat-${cat.id}`}
                    className="flex items-center gap-2.5 cursor-pointer select-none"
                  >
                    <Checkbox
                      id={`cat-${cat.id}`}
                      checked={selectedCategories.includes(cat.id)}
                      onCheckedChange={() => toggleCategory(cat.id)}
                      disabled={isCreating}
                    />
                    <FolderIcon className="size-3.5 text-muted-foreground" />
                    <span className="text-sm">{cat.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              resetForm()
              onOpenChange(false)
            }}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isCreating ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mirror the Rust resolve_image logic for the UI preview */
function resolveImagePreview(service: ServiceName, version: string): string {
  const tag = version
    .split(/\s/)[0]
    .replace(/\.x$/, "")

  switch (service) {
    case "MariaDB":    return `mariadb:${tag}`
    case "MySQL":      return `mysql:${tag}`
    case "PostgreSQL": return `postgres:${tag}`
    case "Redis":      return `redis:${tag}`
  }
}
