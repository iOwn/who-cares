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

const modal = cva(styles.modal, {
  variants: {
    presentation: {
      sheet: styles.sheet,
      center: styles.center,
      fullscreen: styles.fullscreen,
    },
  },
  defaultVariants: {
    presentation: "center",
  },
});

export type DialogPresentation = "sheet" | "center" | "fullscreen";

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
  // RAC contains the overlay with `inert` + `ariaHideOutside` rather than
  // `aria-modal`, and drops any `aria-modal` prop in `filterDOMProps`. We set it
  // on the dialog node ourselves so assistive tech and tooling that key off the
  // attribute still recognise the modal boundary (asserted in Dialog.test.tsx).
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
