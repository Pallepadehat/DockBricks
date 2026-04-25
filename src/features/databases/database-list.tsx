import { DatabaseIcon } from "lucide-react";

import { DatabaseCard } from "@/components/databases/database-card";
import type { RuntimeState } from "@/hooks/use-database-runtime";
import { getDatabaseCategoryNames } from "@/features/databases/database-selectors";
import type { Database } from "@/types/models";

type DatabaseListProps = {
  databases: Database[];
  selectedCategory: string | null;
  selectedCategoryName: string;
  categoryNameById: Record<string, string>;
  runtimeByDbId: Record<string, RuntimeState>;
  actionBusyByDbId: Record<string, boolean>;
  creatingByDbId: Record<string, boolean>;
  engineRunning: boolean;
  onToggleRunning: (databaseId: string) => void;
  onEdit: (databaseId: string) => void;
  onDelete: (databaseId: string) => void;
  onCopyConnectionString: (databaseId: string) => void;
};

export function DatabaseList({
  databases,
  selectedCategory,
  selectedCategoryName,
  categoryNameById,
  runtimeByDbId,
  actionBusyByDbId,
  creatingByDbId,
  engineRunning,
  onToggleRunning,
  onEdit,
  onDelete,
  onCopyConnectionString,
}: DatabaseListProps) {
  if (databases.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <DatabaseIcon className="size-10 stroke-[1.25]" />
        <p className="text-sm font-medium text-foreground/80">No Databases</p>
        <p className="text-xs text-muted-foreground">
          {selectedCategory === null
            ? "Get started by creating a new database."
            : `No databases in "${selectedCategoryName}" yet.`}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full grid grid-cols-1 gap-3">
      {databases.map((db) => (
        <DatabaseCard
          key={db.id}
          db={db}
          categoryNames={getDatabaseCategoryNames(db, categoryNameById)}
          runtime={runtimeByDbId[db.id]}
          actionBusy={actionBusyByDbId[db.id] ?? false}
          isCreating={creatingByDbId[db.id] ?? false}
          engineRunning={engineRunning}
          onToggleRunning={onToggleRunning}
          onEdit={onEdit}
          onDelete={onDelete}
          onCopyConnectionString={onCopyConnectionString}
        />
      ))}
    </div>
  );
}
