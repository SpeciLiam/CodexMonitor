import { useCallback, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { QueuedMessage } from "../../../types";
import SendHorizontal from "lucide-react/dist/esm/icons/send-horizontal";
import {
  PopoverMenuItem,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useMenuController } from "../../app/hooks/useMenuController";

type ComposerQueueProps = {
  queuedMessages: QueuedMessage[];
  pausedReason?: string | null;
  onEditQueued?: (item: QueuedMessage) => void;
  onDeleteQueued?: (id: string) => void;
  onSteerQueued?: (id: string) => void;
};

export function ComposerQueue({
  queuedMessages,
  pausedReason = null,
  onEditQueued,
  onDeleteQueued,
  onSteerQueued,
}: ComposerQueueProps) {
  if (queuedMessages.length === 0) {
    return null;
  }

  return (
    <div className="composer-queue">
      <div className="composer-queue-title">Queued</div>
      {pausedReason ? (
        <div className="composer-queue-hint">{pausedReason}</div>
      ) : null}
      <div className="composer-queue-list">
        {queuedMessages.map((item) => (
          <QueueItem
            key={item.id}
            item={item}
            onEditQueued={onEditQueued}
            onDeleteQueued={onDeleteQueued}
            onSteerQueued={onSteerQueued}
          />
        ))}
      </div>
    </div>
  );
}

const QUEUE_STEER_SWIPE_THRESHOLD_PX = 64;
const QUEUE_STEER_SWIPE_MAX_PX = 96;

type QueueItemProps = {
  item: QueuedMessage;
  onEditQueued?: (item: QueuedMessage) => void;
  onDeleteQueued?: (id: string) => void;
  onSteerQueued?: (id: string) => void;
};

function QueueItem({
  item,
  onEditQueued,
  onDeleteQueued,
  onSteerQueued,
}: QueueItemProps) {
  const dragStartXRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const canSteer = Boolean(onSteerQueued);
  const isArmed = canSteer && Math.abs(dragOffset) >= QUEUE_STEER_SWIPE_THRESHOLD_PX;

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!canSteer || event.pointerType === "mouse") {
        return;
      }
      dragStartXRef.current = event.clientX;
      setIsDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [canSteer],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!canSteer || dragStartXRef.current === null) {
        return;
      }
      const delta = event.clientX - dragStartXRef.current;
      const clamped = Math.max(
        -QUEUE_STEER_SWIPE_MAX_PX,
        Math.min(QUEUE_STEER_SWIPE_MAX_PX, delta),
      );
      setDragOffset(clamped);
      if (Math.abs(delta) > 8) {
        event.preventDefault();
      }
    },
    [canSteer],
  );

  const finishDrag = useCallback(() => {
    if (!canSteer || dragStartXRef.current === null) {
      return;
    }
    const shouldSteer = Math.abs(dragOffset) >= QUEUE_STEER_SWIPE_THRESHOLD_PX;
    dragStartXRef.current = null;
    setIsDragging(false);
    setDragOffset(0);
    if (shouldSteer) {
      onSteerQueued?.(item.id);
    }
  }, [canSteer, dragOffset, item.id, onSteerQueued]);

  return (
    <div
      className={`composer-queue-swipe${isDragging ? " is-dragging" : ""}${isArmed ? " is-armed" : ""}`}
    >
      <div className="composer-queue-steer-bg" aria-hidden>
        <SendHorizontal size={14} />
      </div>
      <div
        className="composer-queue-item"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        style={{ transform: `translateX(${dragOffset}px)` }}
      >
        <span className="composer-queue-text">
          {item.text ||
            (item.images?.length
              ? item.images.length === 1
                ? "Image"
                : "Images"
              : "")}
          {item.images?.length
            ? ` · ${item.images.length} image${item.images.length === 1 ? "" : "s"}`
            : ""}
        </span>
        <QueueMenuButton
          item={item}
          onEditQueued={onEditQueued}
          onDeleteQueued={onDeleteQueued}
        />
      </div>
    </div>
  );
}

type QueueMenuButtonProps = {
  item: QueuedMessage;
  onEditQueued?: (item: QueuedMessage) => void;
  onDeleteQueued?: (id: string) => void;
};

function QueueMenuButton({ item, onEditQueued, onDeleteQueued }: QueueMenuButtonProps) {
  const menu = useMenuController();
  const handleToggleMenu = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      menu.toggle();
    },
    [menu],
  );

  const handleEdit = useCallback(() => {
    menu.close();
    onEditQueued?.(item);
  }, [item, menu, onEditQueued]);

  const handleDelete = useCallback(() => {
    menu.close();
    onDeleteQueued?.(item.id);
  }, [item.id, menu, onDeleteQueued]);

  return (
    <div className="composer-queue-menu-wrap" ref={menu.containerRef}>
      <button
        type="button"
        className={`composer-queue-menu${menu.isOpen ? " is-open" : ""}`}
        onClick={handleToggleMenu}
        aria-label="Queue item menu"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
      >
        ...
      </button>
      {menu.isOpen && (
        <PopoverSurface className="composer-queue-item-popover" role="menu">
          <PopoverMenuItem onClick={handleEdit}>Edit</PopoverMenuItem>
          <PopoverMenuItem onClick={handleDelete}>Delete</PopoverMenuItem>
        </PopoverSurface>
      )}
    </div>
  );
}
