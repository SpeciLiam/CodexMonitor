import { useCallback, useState } from "react";
import type { WorkspaceInfo } from "@/types";

type UseMainAppMobileThreadRefreshArgs = {
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: { activate?: boolean },
  ) => Promise<string | null>;
  refreshThread: (workspaceId: string, threadId: string) => Promise<unknown>;
  listThreadsForWorkspace: (
    workspace: WorkspaceInfo,
    options?: { preserveState?: boolean },
  ) => Promise<unknown>;
  reconnectLive: (
    workspaceId: string,
    threadId: string,
    options?: { runResume?: boolean },
  ) => Promise<unknown>;
};

export function useMainAppMobileThreadRefresh({
  activeWorkspace,
  activeThreadId,
  startThreadForWorkspace,
  refreshThread,
  listThreadsForWorkspace,
  reconnectLive,
}: UseMainAppMobileThreadRefreshArgs) {
  const [mobileThreadRefreshLoading, setMobileThreadRefreshLoading] = useState(false);

  const handleMobileThreadRefresh = useCallback(() => {
    if (mobileThreadRefreshLoading || !activeWorkspace) {
      return;
    }
    setMobileThreadRefreshLoading(true);
    void (async () => {
      await listThreadsForWorkspace(activeWorkspace, { preserveState: true });
      let threadId = activeThreadId;
      if (!threadId) {
        threadId = await startThreadForWorkspace(activeWorkspace.id, {
          activate: true,
        });
      }
      if (!threadId) {
        return;
      }
      await refreshThread(activeWorkspace.id, threadId);
      await listThreadsForWorkspace(activeWorkspace, { preserveState: true });
      await reconnectLive(activeWorkspace.id, threadId, { runResume: false });
    })()
      .catch(() => {
        // Existing thread actions surface errors through debug entries and toasts.
      })
      .finally(() => {
        setMobileThreadRefreshLoading(false);
      });
  }, [
    activeThreadId,
    activeWorkspace,
    listThreadsForWorkspace,
    mobileThreadRefreshLoading,
    reconnectLive,
    refreshThread,
    startThreadForWorkspace,
  ]);

  return {
    mobileThreadRefreshLoading,
    handleMobileThreadRefresh,
  };
}
