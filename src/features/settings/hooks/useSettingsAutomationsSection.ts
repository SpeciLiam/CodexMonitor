import { useCallback, useEffect, useState } from "react";
import type {
  AutomationSummary,
  AutomationUpsertInput,
  AutomationsSettings,
} from "@services/tauri";
import {
  automationsCreate,
  automationsDelete,
  automationsList,
  automationsSetStatus,
  automationsUpdate,
} from "@services/tauri";

export type SettingsAutomationsSectionProps = {
  settings: AutomationsSettings | null;
  isLoading: boolean;
  busyAutomationId: string | null;
  isCreating: boolean;
  error: string | null;
  onRefresh: () => void;
  onCreateAutomation: (input: AutomationUpsertInput) => Promise<boolean>;
  onUpdateAutomation: (input: AutomationUpsertInput) => Promise<boolean>;
  onDeleteAutomation: (id: string) => Promise<boolean>;
  onSetAutomationStatus: (id: string, status: string) => Promise<boolean>;
};

const toErrorMessage = (value: unknown, fallback: string): string => {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return fallback;
};

export const useSettingsAutomationsSection =
  (): SettingsAutomationsSectionProps => {
    const [settings, setSettings] = useState<AutomationsSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [busyAutomationId, setBusyAutomationId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
      setIsLoading(true);
      setError(null);
      try {
        setSettings(await automationsList());
      } catch (refreshError) {
        setError(toErrorMessage(refreshError, "Unable to load automations."));
      } finally {
        setIsLoading(false);
      }
    }, []);

    useEffect(() => {
      void refresh();
    }, [refresh]);

    const applySettingsResponse = (response: AutomationsSettings) => {
      setSettings(response);
    };

    const onCreateAutomation = useCallback(
      async (input: AutomationUpsertInput): Promise<boolean> => {
        setIsCreating(true);
        setError(null);
        try {
          applySettingsResponse(await automationsCreate(input));
          return true;
        } catch (createError) {
          setError(toErrorMessage(createError, "Unable to create automation."));
          return false;
        } finally {
          setIsCreating(false);
        }
      },
      [],
    );

    const withAutomationBusy = useCallback(
      async (
        automationId: string,
        action: () => Promise<AutomationsSettings>,
        fallback: string,
      ): Promise<boolean> => {
        setBusyAutomationId(automationId);
        setError(null);
        try {
          applySettingsResponse(await action());
          return true;
        } catch (actionError) {
          setError(toErrorMessage(actionError, fallback));
          return false;
        } finally {
          setBusyAutomationId(null);
        }
      },
      [],
    );

    const onUpdateAutomation = useCallback(
      async (input: AutomationUpsertInput): Promise<boolean> =>
        withAutomationBusy(
          input.id,
          () => automationsUpdate(input),
          "Unable to update automation.",
        ),
      [withAutomationBusy],
    );

    const onDeleteAutomation = useCallback(
      async (id: string): Promise<boolean> =>
        withAutomationBusy(
          id,
          () => automationsDelete(id),
          "Unable to delete automation.",
        ),
      [withAutomationBusy],
    );

    const onSetAutomationStatus = useCallback(
      async (id: string, status: string): Promise<boolean> =>
        withAutomationBusy(
          id,
          () => automationsSetStatus({ id, status }),
          "Unable to update automation status.",
        ),
      [withAutomationBusy],
    );

    return {
      settings,
      isLoading,
      busyAutomationId,
      isCreating,
      error,
      onRefresh: refresh,
      onCreateAutomation,
      onUpdateAutomation,
      onDeleteAutomation,
      onSetAutomationStatus,
    };
  };

export type AutomationFormDraft = Pick<
  AutomationSummary,
  | "id"
  | "name"
  | "kind"
  | "status"
  | "rrule"
  | "prompt"
  | "model"
  | "reasoningEffort"
  | "executionEnvironment"
  | "cwds"
>;
