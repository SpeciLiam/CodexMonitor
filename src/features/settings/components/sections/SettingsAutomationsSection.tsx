import { useMemo, useState } from "react";
import type { AutomationUpsertInput } from "@services/tauri";
import type {
  AutomationFormDraft,
  SettingsAutomationsSectionProps,
} from "@settings/hooks/useSettingsAutomationsSection";
import {
  SettingsSection,
  SettingsSubsection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";

const EMPTY_DRAFT: AutomationFormDraft = {
  id: "",
  name: "",
  kind: "cron",
  status: "ACTIVE",
  rrule: "FREQ=DAILY",
  prompt: "",
  model: "gpt-5.4",
  reasoningEffort: "medium",
  executionEnvironment: "local",
  cwds: [],
};

const normalizeOptional = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

const draftToInput = (
  draft: AutomationFormDraft,
  cwdsText: string,
): AutomationUpsertInput => ({
  id: draft.id.trim(),
  name: draft.name.trim(),
  kind: draft.kind.trim() || "cron",
  status: draft.status.trim() || "ACTIVE",
  rrule: draft.rrule.trim(),
  prompt: draft.prompt,
  model: normalizeOptional(draft.model),
  reasoningEffort: normalizeOptional(draft.reasoningEffort),
  executionEnvironment: normalizeOptional(draft.executionEnvironment),
  cwds: cwdsText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0),
});

const formatDate = (timestamp: number | null): string => {
  if (!timestamp) {
    return "Never";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
};

const compactPrompt = (prompt: string): string => {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) {
    return normalized;
  }
  return `${normalized.slice(0, 177)}...`;
};

export function SettingsAutomationsSection({
  settings,
  isLoading,
  busyAutomationId,
  isCreating,
  error,
  onRefresh,
  onCreateAutomation,
  onUpdateAutomation,
  onDeleteAutomation,
  onSetAutomationStatus,
}: SettingsAutomationsSectionProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<AutomationFormDraft>(EMPTY_DRAFT);
  const [createCwdsText, setCreateCwdsText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AutomationFormDraft>(EMPTY_DRAFT);
  const [editCwdsText, setEditCwdsText] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const automations = settings?.automations ?? [];
  const activeCount = useMemo(
    () =>
      automations.filter(
        (automation) => automation.status.toUpperCase() === "ACTIVE",
      ).length,
    [automations],
  );

  const validateInput = (input: AutomationUpsertInput): string | null => {
    if (!input.id) {
      return "Automation id is required.";
    }
    if (!/^[A-Za-z0-9_-]+$/.test(input.id)) {
      return "Automation id may only contain letters, numbers, hyphens, and underscores.";
    }
    if (!input.name) {
      return "Name is required.";
    }
    if (!input.rrule) {
      return "RRULE is required.";
    }
    return null;
  };

  const resetCreate = () => {
    setCreateDraft(EMPTY_DRAFT);
    setCreateCwdsText("");
    setCreateOpen(false);
    setFormError(null);
  };

  const handleCreate = async () => {
    const input = draftToInput(createDraft, createCwdsText);
    const validation = validateInput(input);
    if (validation) {
      setFormError(validation);
      return;
    }
    const created = await onCreateAutomation(input);
    if (created) {
      resetCreate();
    }
  };

  const startEditing = (automation: AutomationFormDraft) => {
    setEditingId(automation.id);
    setEditDraft({
      ...automation,
      model: automation.model ?? "",
      reasoningEffort: automation.reasoningEffort ?? "",
      executionEnvironment: automation.executionEnvironment ?? "",
    });
    setEditCwdsText(automation.cwds.join("\n"));
    setPendingDeleteId(null);
    setFormError(null);
  };

  const handleUpdate = async () => {
    const input = draftToInput(editDraft, editCwdsText);
    const validation = validateInput(input);
    if (validation) {
      setFormError(validation);
      return;
    }
    const updated = await onUpdateAutomation(input);
    if (updated) {
      setEditingId(null);
      setFormError(null);
    }
  };

  const renderForm = (
    draft: AutomationFormDraft,
    setDraft: (draft: AutomationFormDraft) => void,
    cwdsText: string,
    setCwdsText: (value: string) => void,
    options: { idReadonly: boolean; submitLabel: string; onSubmit: () => void; onCancel: () => void; disabled: boolean },
  ) => (
    <div className="settings-automations-form">
      <label className="settings-field">
        <span className="settings-field-label">Id</span>
        <input
          className="settings-input"
          value={draft.id}
          readOnly={options.idReadonly}
          onChange={(event) => setDraft({ ...draft, id: event.target.value })}
          placeholder="daily-refresh"
        />
      </label>
      <label className="settings-field">
        <span className="settings-field-label">Name</span>
        <input
          className="settings-input"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          placeholder="Daily refresh"
        />
      </label>
      <div className="settings-automations-grid">
        <label className="settings-field">
          <span className="settings-field-label">Status</span>
          <select
            className="settings-select"
            value={draft.status}
            onChange={(event) => setDraft({ ...draft, status: event.target.value })}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="PAUSED">PAUSED</option>
          </select>
        </label>
        <label className="settings-field">
          <span className="settings-field-label">Kind</span>
          <input
            className="settings-input"
            value={draft.kind}
            onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
          />
        </label>
      </div>
      <label className="settings-field">
        <span className="settings-field-label">RRULE</span>
        <input
          className="settings-input"
          value={draft.rrule}
          onChange={(event) => setDraft({ ...draft, rrule: event.target.value })}
          placeholder="FREQ=DAILY;BYHOUR=9;BYMINUTE=0"
        />
      </label>
      <div className="settings-automations-grid">
        <label className="settings-field">
          <span className="settings-field-label">Model</span>
          <input
            className="settings-input"
            value={draft.model ?? ""}
            onChange={(event) => setDraft({ ...draft, model: event.target.value })}
            placeholder="gpt-5.4"
          />
        </label>
        <label className="settings-field">
          <span className="settings-field-label">Reasoning</span>
          <input
            className="settings-input"
            value={draft.reasoningEffort ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, reasoningEffort: event.target.value })
            }
            placeholder="medium"
          />
        </label>
      </div>
      <label className="settings-field">
        <span className="settings-field-label">Execution environment</span>
        <input
          className="settings-input"
          value={draft.executionEnvironment ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, executionEnvironment: event.target.value })
          }
          placeholder="local"
        />
      </label>
      <label className="settings-field">
        <span className="settings-field-label">Working directories</span>
        <textarea
          className="settings-automations-textarea settings-automations-textarea--short"
          value={cwdsText}
          onChange={(event) => setCwdsText(event.target.value)}
          placeholder="/Users/me/project"
        />
      </label>
      <label className="settings-field">
        <span className="settings-field-label">Prompt</span>
        <textarea
          className="settings-automations-textarea"
          value={draft.prompt}
          onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
          placeholder="Describe what Codex should run on this schedule."
        />
      </label>
      <div className="settings-automations-actions">
        <button
          type="button"
          className="primary"
          onClick={options.onSubmit}
          disabled={options.disabled}
        >
          {options.submitLabel}
        </button>
        <button type="button" className="ghost" onClick={options.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <SettingsSection
      title="Automations"
      subtitle="Manage the same scheduled automations Codex reads from CODEX_HOME."
    >
      <SettingsToggleRow
        title="Codex automations"
        subtitle={
          settings
            ? `${automations.length} total, ${activeCount} active. ${settings.automationsPath}`
            : "Loading CODEX_HOME automations."
        }
      >
        <button type="button" className="ghost" onClick={onRefresh} disabled={isLoading}>
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </SettingsToggleRow>
      {error && <div className="settings-help">{error}</div>}
      {formError && <div className="settings-help">{formError}</div>}

      <SettingsSubsection
        title="Create Automation"
        subtitle="New automations are written to CODEX_HOME/automations."
      />
      {!createOpen ? (
        <button type="button" className="primary" onClick={() => setCreateOpen(true)}>
          New automation
        </button>
      ) : (
        renderForm(createDraft, setCreateDraft, createCwdsText, setCreateCwdsText, {
          idReadonly: false,
          submitLabel: isCreating ? "Creating..." : "Create",
          onSubmit: handleCreate,
          onCancel: resetCreate,
          disabled: isCreating,
        })
      )}

      <SettingsSubsection
        title="Existing Automations"
        subtitle="Pause, edit, or delete automations from Codex's canonical store."
      />
      {!isLoading && automations.length === 0 && (
        <div className="settings-help">No automations found.</div>
      )}
      <div className="settings-automations-list">
        {automations.map((automation) => {
          const isActive = automation.status.toUpperCase() === "ACTIVE";
          const isBusy = busyAutomationId === automation.id;
          const isEditing = editingId === automation.id;
          return (
            <div className="settings-automations-card" key={automation.id}>
              <div className="settings-automations-card-header">
                <div className="settings-automations-title-block">
                  <div className="settings-automations-title">{automation.name}</div>
                  <div className="settings-automations-meta">
                    {automation.id} · {automation.kind} · Updated{" "}
                    {formatDate(automation.updatedAt)}
                  </div>
                </div>
                <SettingsToggleSwitch
                  pressed={isActive}
                  disabled={isBusy}
                  onClick={() =>
                    void onSetAutomationStatus(
                      automation.id,
                      isActive ? "PAUSED" : "ACTIVE",
                    )
                  }
                  aria-label={`${isActive ? "Pause" : "Resume"} ${automation.name}`}
                />
              </div>
              <div className="settings-automations-pills">
                <span>{automation.status}</span>
                <span>{automation.rrule}</span>
                {automation.model && <span>{automation.model}</span>}
                {automation.executionEnvironment && (
                  <span>{automation.executionEnvironment}</span>
                )}
                {automation.memoryExists && <span>memory.md</span>}
              </div>
              <div className="settings-automations-prompt">
                {compactPrompt(automation.prompt)}
              </div>
              {automation.cwds.length > 0 && (
                <div className="settings-automations-cwds">
                  {automation.cwds.join(", ")}
                </div>
              )}
              <div className="settings-automations-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => startEditing(automation)}
                  disabled={isBusy}
                >
                  Edit
                </button>
                {pendingDeleteId === automation.id ? (
                  <>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void onDeleteAutomation(automation.id)}
                      disabled={isBusy}
                    >
                      Delete forever
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setPendingDeleteId(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setPendingDeleteId(automation.id)}
                    disabled={isBusy}
                  >
                    Delete
                  </button>
                )}
              </div>
              {isEditing &&
                renderForm(editDraft, setEditDraft, editCwdsText, setEditCwdsText, {
                  idReadonly: true,
                  submitLabel: isBusy ? "Saving..." : "Save",
                  onSubmit: handleUpdate,
                  onCancel: () => setEditingId(null),
                  disabled: isBusy,
                })}
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}
