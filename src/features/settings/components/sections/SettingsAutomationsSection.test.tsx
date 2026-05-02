// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettingsAutomationsSectionProps } from "@settings/hooks/useSettingsAutomationsSection";
import { SettingsAutomationsSection } from "./SettingsAutomationsSection";

const baseProps = (): SettingsAutomationsSectionProps => ({
  settings: {
    automationsPath: "/Users/me/.codex/automations",
    automations: [
      {
        id: "daily-refresh",
        name: "Daily refresh",
        kind: "cron",
        status: "ACTIVE",
        rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
        prompt: "Refresh the tracker.",
        model: "gpt-5.4",
        reasoningEffort: "medium",
        executionEnvironment: "local",
        cwds: ["/Users/me/project"],
        createdAt: 1775535691808,
        updatedAt: 1775535691808,
        configPath: "/Users/me/.codex/automations/daily-refresh/automation.toml",
        memoryExists: true,
      },
    ],
  },
  isLoading: false,
  busyAutomationId: null,
  isCreating: false,
  error: null,
  onRefresh: vi.fn(),
  onCreateAutomation: vi.fn(async () => true),
  onUpdateAutomation: vi.fn(async () => true),
  onDeleteAutomation: vi.fn(async () => true),
  onSetAutomationStatus: vi.fn(async () => true),
});

describe("SettingsAutomationsSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders canonical Codex automation rows", () => {
    render(<SettingsAutomationsSection {...baseProps()} />);

    expect(screen.getByText("Daily refresh")).toBeTruthy();
    expect(screen.getByText("FREQ=DAILY;BYHOUR=9;BYMINUTE=0")).toBeTruthy();
    expect(screen.getByText("memory.md")).toBeTruthy();
    expect(screen.getByText("/Users/me/project")).toBeTruthy();
  });

  it("toggles active automations to paused", async () => {
    const props = baseProps();
    const onSetAutomationStatus = vi.fn(async () => true);
    render(
      <SettingsAutomationsSection
        {...props}
        onSetAutomationStatus={onSetAutomationStatus}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause Daily refresh" }));

    await waitFor(() => {
      expect(onSetAutomationStatus).toHaveBeenCalledWith("daily-refresh", "PAUSED");
    });
  });

  it("creates an automation from the form", async () => {
    const props = baseProps();
    const onCreateAutomation = vi.fn(async () => true);
    render(
      <SettingsAutomationsSection
        {...props}
        onCreateAutomation={onCreateAutomation}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New automation" }));
    fireEvent.change(screen.getByLabelText("Id"), {
      target: { value: "weekly-review" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Weekly review" },
    });
    fireEvent.change(screen.getByLabelText("RRULE"), {
      target: { value: "FREQ=WEEKLY;BYDAY=MO" },
    });
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Summarize last week." },
    });
    fireEvent.change(screen.getByLabelText("Working directories"), {
      target: { value: "/Users/me/project\n/Users/me/other" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(onCreateAutomation).toHaveBeenCalledWith({
        id: "weekly-review",
        name: "Weekly review",
        kind: "cron",
        status: "ACTIVE",
        rrule: "FREQ=WEEKLY;BYDAY=MO",
        prompt: "Summarize last week.",
        model: "gpt-5.4",
        reasoningEffort: "medium",
        executionEnvironment: "local",
        cwds: ["/Users/me/project", "/Users/me/other"],
      });
    });
  });

  it("updates an existing automation without changing its id", async () => {
    const props = baseProps();
    const onUpdateAutomation = vi.fn(async () => true);
    render(
      <SettingsAutomationsSection
        {...props}
        onUpdateAutomation={onUpdateAutomation}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const nameInputs = screen.getAllByLabelText("Name") as HTMLInputElement[];
    fireEvent.change(nameInputs[0], { target: { value: "Morning refresh" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onUpdateAutomation).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "daily-refresh",
          name: "Morning refresh",
        }),
      );
    });
  });
});
