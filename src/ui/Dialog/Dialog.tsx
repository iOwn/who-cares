"use client";

import { cva } from "class-variance-authority";
import { createContext, forwardRef, type ReactNode, useCallback, useContext } from "react";
import {
  Heading,
  ModalOverlay,
  type ModalOverlayProps,
  Dialog as RACDialog,
  type DialogProps as RACDialogProps,
  DialogTrigger as RACDialogTrigger,
  Modal as RACModal,
} from "react-aria-components";
import { cx } from "../cx";
import styles from "./Dialog.module.css";

/**
 * `Dialog` — the one modal-overlay primitive (docs/design-system-inventory.md
 * §9). Covers the three overlay presentations WhoCares needs:
 *
 *   - `sheet`      — mobile bottom sheet (grabber handle, rounded top corners)
 *   - `center`     — centred modal card; also the desktop form of `sheet`
 *   - `fullscreen` — edge-to-edge form surface (the "I'm out" / "Recurring" flows)
 *
 * Built on RAC `ModalOverlay` + `Modal` + `Dialog`. RAC gives us the focus
 * trap, focus restore, scroll lock, Escape-to-close and (via `ariaHideOutside`
 * + `inert`) sibling hiding for free; this wrapper adds the presentation
 * styling, `Dialog.Header`, and the semantic-token scrim / z-index.
 *
 * The inbox side-panel is deliberately NOT a Dialog — it is feature layout
 * (fullscreen route on mobile, panel region on desktop).
 *
 * Compose it with `DialogTrigger` (re-exported from here):
 *
 *   <DialogTrigger>
 *     <Button>Open</Button>
 *     <Dialog presentation="sheet">
 *       {({ close }) => (
 *         <>
 *           <Dialog.Header title="…" trailing={<Button onPress={close}>Done</Button>} />
 *           …
 *         </>
 *       )}
 *     </Dialog>
 *   </DialogTrigger>
 */

export type DialogPresentation = "sheet" | "center" | "fullscreen";

/** `presentation` is defaulted once, in the `DialogRoot` destructure. */
const modal = cva(styles.modal, {
  variants: {
    presentation: {
      sheet: styles.sheet,
      center: styles.center,
      fullscreen: styles.fullscreen,
    },
  },
});

/** Fallback only for a `Dialog.Header` rendered outside a `Dialog` (unsupported). */
const DialogPresentationContext = createContext<DialogPresentation>("center");

/** The overlay-level props (open state, dismiss behaviour) live on `ModalOverlay`. */
type OverlayPassthrough = Pick<
  ModalOverlayProps,
  | "isOpen"
  | "defaultOpen"
  | "onOpenChange"
  | "isDismissable"
  | "isKeyboardDismissDisabled"
  | "isEntering"
  | "isExiting"
>;

export interface DialogProps
  extends OverlayPassthrough,
    Pick<RACDialogProps, "role" | "aria-label" | "aria-labelledby" | "aria-describedby"> {
  /** How the overlay is presented. `center` (default) also covers desktop sheets. */
  presentation?: DialogPresentation;
  /** Dialog body. A function form receives `{ close }` to dismiss programmatically. */
  children: RACDialogProps["children"];
  /** Forwarded to the RAC `Dialog` element and merged LAST. */
  className?: string;
  /** Forwarded to the RAC `Dialog` element and merged LAST (the escape hatch). */
  style?: React.CSSProperties;
}

interface DialogComponent
  extends React.ForwardRefExoticComponent<DialogProps & React.RefAttributes<HTMLElement>> {
  Header: typeof DialogHeader;
}

const DialogRoot = forwardRef<HTMLElement, DialogProps>(function Dialog(
  {
    presentation = "center",
    isOpen,
    defaultOpen,
    onOpenChange,
    isDismissable = true,
    isKeyboardDismissDisabled,
    isEntering,
    isExiting,
    role,
    className,
    style,
    children,
    ...ariaProps
  },
  ref,
) {
  // react-aria DELIBERATELY omits `aria-modal` (see its useDialog.mjs): with
  // `aria-modal` set, Safari-in-an-iframe force-focuses the first focusable
  // element on mount regardless of what we focus programmatically
  // (https://bugs.webkit.org/show_bug.cgi?id=211934). It instead makes the
  // dialog behave modally by marking every sibling `inert` + `aria-hidden`
  // (`ariaHideOutside`), and strips any `aria-modal` prop in `filterDOMProps`.
  //
  // WhoCares is never iframe-embedded, and issue #44's acceptance criteria ask
  // for the attribute, so we re-add it on the dialog node via this merged
  // callback ref (asserted in Dialog.test.tsx). Revisit if the app is ever
  // embedded.
  const dialogRef = useCallback(
    (node: HTMLElement | null) => {
      node?.setAttribute("aria-modal", "true");
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  return (
    <ModalOverlay
      className={styles.overlay}
      isOpen={isOpen}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={isKeyboardDismissDisabled}
      isEntering={isEntering}
      isExiting={isExiting}
    >
      <RACModal className={cx(modal({ presentation }))}>
        <DialogPresentationContext.Provider value={presentation}>
          <RACDialog
            {...ariaProps}
            ref={dialogRef}
            role={role}
            className={cx(styles.dialog, className)}
            style={style}
          >
            {children}
          </RACDialog>
        </DialogPresentationContext.Provider>
      </RACModal>
    </ModalOverlay>
  );
});

export interface DialogHeaderProps {
  /** The dialog's visible title. Rendered as the RAC title slot, so it also
   * becomes the dialog's accessible name (`aria-labelledby`). */
  title: ReactNode;
  /** Leading affordance — typically a "Cancel" `Button` or a close `IconButton`. */
  leading?: ReactNode;
  /** Trailing affordance — typically a confirm / "Done" `Button`. */
  trailing?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * `Dialog.Header` — `leading` / `title` / `trailing` row. The bottom-sheet
 * grabber handle renders automatically for `presentation="sheet"` only.
 */
const DialogHeader = forwardRef<HTMLElement, DialogHeaderProps>(function DialogHeader(
  { title, leading, trailing, className, style },
  ref,
) {
  const presentation = useContext(DialogPresentationContext);
  return (
    <header ref={ref} className={cx(styles.header, className)} style={style}>
      {presentation === "sheet" ? <span className={styles.grabber} aria-hidden="true" /> : null}
      <div className={styles.headerBar}>
        <span className={styles.headerSlot}>{leading}</span>
        <Heading slot="title" className={styles.title}>
          {title}
        </Heading>
        <span className={cx(styles.headerSlot, styles.headerSlotEnd)}>{trailing}</span>
      </div>
    </header>
  );
});

export const Dialog = Object.assign(DialogRoot as DialogComponent, { Header: DialogHeader });

export { RACDialogTrigger as DialogTrigger };
