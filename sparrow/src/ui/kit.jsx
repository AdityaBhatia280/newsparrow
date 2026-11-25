// Sparrow's UI kit: liquid-glass surfaces, buttons, chips, fields, sheets and feedback.
import { useEffect, useRef, useState } from "preact/hooks";
import { BY_ID } from "../../../shared/taxonomy.mjs";
import { glint } from "../lib/hooks.js";
import { confirmState, toasts } from "../lib/store.js";
import { Icon } from "./icons.jsx";

const cx = (...parts) => parts.filter(Boolean).join(" ");

export function Glass({ as: Tag = "div", class: cls, interactive, strong, pad = true, children, ...rest }) {
  return (
    <Tag
      class={cx("glass", strong && "glass--strong", interactive && "glass--interactive", pad === "lg" ? "glass--lg" : pad && "glass--pad", cls)}
      onPointerMove={interactive ? glint : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function Button({ variant = "primary", size, icon, iconRight, loading, block, href, class: cls, children, type = "button", ...rest }) {
  const classes = cx("btn", `btn--${variant}`, size && `btn--${size}`, block && "btn--block", cls);
  const inner = (
    <>
      {loading ? <span class="btn__spinner" aria-hidden="true" /> : icon && <Icon name={icon} />}
      {children}
      {iconRight && !loading && <Icon name={iconRight} />}
    </>
  );
  if (href) {
    const external = /^https?:/.test(href);
    return (
      <a class={classes} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} {...rest}>
        {inner}
      </a>
    );
  }
  return (
    <button class={classes} type={type} disabled={loading || rest.disabled} aria-busy={loading ? "true" : undefined} {...rest}>
      {inner}
    </button>
  );
}

export function IconButton({ icon, label, pressed, class: cls, ...rest }) {
  return (
    <button type="button" class={cx("icon-btn", cls)} aria-label={label} title={label} aria-pressed={pressed === undefined ? undefined : String(!!pressed)} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

export function Chip({ selected, icon, size, children, class: cls, ...rest }) {
  return (
    <button type="button" class={cx("chip", size === "sm" && "chip--sm", cls)} aria-pressed={String(!!selected)} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function ChipGroup({ options, value = [], onChange, multiple = true, label, size }) {
  const toggle = (id) => {
    if (!multiple) return onChange(value === id ? null : id);
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  return (
    <div class="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <Chip key={o.id} icon={o.icon} size={size} selected={multiple ? value.includes(o.id) : value === o.id} onClick={() => toggle(o.id)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div class="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={String(value === o.id)} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PillSelect({ label, value, options, onChange, allLabel }) {
  return (
    <label class="pill-select" data-active={value ? "true" : "false"}>
      <span class="visually-hidden">{label}</span>
      <select value={value || ""} onChange={(e) => onChange(e.currentTarget.value || null)}>
        <option value="">{allLabel || label}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" />
    </label>
  );
}

export function Field({ label, hint, error, count, max, children, id }) {
  return (
    <div class="field">
      {(label || max) && (
        <div class="field__row">
          {label && (
            <label class="field__label" for={id}>
              {label}
            </label>
          )}
          {max && (
            <span class="counter" data-over={String((count ?? 0) > max)} aria-live="polite">
              {count ?? 0}/{max}
            </span>
          )}
        </div>
      )}
      {children}
      {hint && !error && <span class="field__hint">{hint}</span>}
      {error && (
        <span class="error-text" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

let fieldId = 0;
const useId = (prefix) => useRef(`${prefix}-${++fieldId}`).current;

export function TextField({ label, hint, error, value, onInput, max, counter, multiline, rows, class: cls, id: givenId, ...rest }) {
  const generated = useId("f");
  const id = givenId || generated;
  const Tag = multiline ? "textarea" : "input";
  return (
    <Field label={label} hint={hint} error={error} id={id} max={counter ? max : undefined} count={value?.length ?? 0}>
      <Tag
        id={id}
        class={cx(multiline ? "textarea" : "input", cls)}
        value={value ?? ""}
        onInput={(e) => onInput?.(e.currentTarget.value)}
        maxLength={max && !counter ? max : undefined}
        rows={rows}
        aria-invalid={error ? "true" : undefined}
        {...rest}
      />
    </Field>
  );
}

export function SelectField({ label, hint, value, onChange, options, placeholder, ...rest }) {
  const id = useId("s");
  return (
    <Field label={label} hint={hint} id={id}>
      <select id={id} class="select" value={value ?? ""} onChange={(e) => onChange(e.currentTarget.value || null)} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Check({ checked, onChange, children, ...rest }) {
  return (
    <label class="check">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.currentTarget.checked)} {...rest} />
      <span>{children}</span>
    </label>
  );
}

export function Switch({ checked, onChange, label, description, disabled }) {
  return (
    <label class="switch">
      <span>
        <span style={{ display: "block", fontWeight: 500 }}>{label}</span>
        {description && <span class="field__hint">{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="switch__track" aria-hidden="true" />
    </label>
  );
}

export function Tag({ tone, icon, children }) {
  return (
    <span class={cx("tag", tone && `tag--${tone}`)}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export function Notice({ tone, icon, children }) {
  return (
    <div class={cx("notice", tone && `notice--${tone}`)} role={tone === "bad" ? "alert" : undefined}>
      <Icon name={icon || (tone === "bad" ? "alert" : tone === "warn" ? "warning" : "info")} />
      <div>{children}</div>
    </div>
  );
}

export function TypeTile({ type, size }) {
  return (
    <span class={cx("tile", size && `tile--${size}`)} data-type={type} aria-hidden="true">
      <Icon name={BY_ID.type[type]?.icon || "sparkles"} />
    </span>
  );
}

export function Skeleton({ height = 120, count = 1, grid }) {
  const items = Array.from({ length: count }, (_, i) => <div key={i} class="skeleton" style={{ height }} />);
  return grid ? <div class="card-grid">{items}</div> : <div class="stack">{items}</div>;
}

export function Empty({ icon = "telescope", title, children, action }) {
  return (
    <div class="empty">
      <span class="tile tile--lg" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Ring({ value, size = 30 }) {
  const r = 13, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <svg class="ring" viewBox="0 0 32 32" style={{ "--size": size + "px" }} aria-hidden="true">
      <defs>
        <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8fe1ff" />
          <stop offset="1" stop-color="#2b7fff" />
        </linearGradient>
      </defs>
      <circle class="ring__track" cx="16" cy="16" r={r} />
      <circle class="ring__value" cx="16" cy="16" r={r} stroke-dasharray={c} stroke-dashoffset={c * (1 - v / 100)} transform="rotate(-90 16 16)" />
    </svg>
  );
}

export function Sheet({ open, onClose, title, children, footer, wide }) {
  const ref = useRef(null);
  const returnFocus = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnFocus.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => () => returnFocus.current?.focus?.(), []);
  return (
    <dialog
      ref={ref}
      class={cx("sheet", wide && "sheet--wide")}
      aria-label={title}
      onClose={() => {
        onClose?.();
        returnFocus.current?.focus?.();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      {open && (
        <div class="sheet__panel glass glass--strong">
          <div class="sheet__head">
            <h2>{title}</h2>
            <IconButton icon="x" label="Close" class="icon-btn--plain" onClick={() => onClose?.()} />
          </div>
          <div class="sheet__body">{children}</div>
          {footer && <div class="sheet__foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmHost() {
  const state = confirmState.value;
  const [text, setText] = useState("");
  const done = (ok) => {
    state?.resolve(ok);
    confirmState.value = null;
    setText("");
  };
  return (
    <Sheet
      open={!!state}
      onClose={() => state && done(false)}
      title={state?.title || ""}
      footer={
        state && (
          <>
            <Button variant="ghost" onClick={() => done(false)}>
              Cancel
            </Button>
            <Button variant={state.tone === "danger" ? "danger" : "primary"} disabled={state.requireText && text !== state.requireText} onClick={() => done(true)}>
              {state.confirmLabel}
            </Button>
          </>
        )
      }
    >
      {state && (
        <>
          <p class="lead" style={{ fontSize: "16px" }}>
            {state.body}
          </p>
          {state.requireText && <TextField label={`Type ${state.requireText} to confirm`} value={text} onInput={setText} autoComplete="off" />}
        </>
      )}
    </Sheet>
  );
}

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={cx("toast glass", t.tone === "bad" && "toast--bad")}>
          <Icon name={t.tone === "bad" ? "alert" : t.tone === "ok" ? "circle-check" : "sparkles"} />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/** A poster headline with one cursive accent: <Display pre="Find your" accent="next" post="step" />. */
export function Display({ pre, accent, post, as: Tag = "h1", size, id }) {
  return (
    <Tag class={cx("display", size && `display--${size}`)} id={id} tabIndex={-1}>
      {pre}
      {pre && accent && " "}
      {accent && <span class="script">{accent}</span>}
      {post && " "}
      {post}
    </Tag>
  );
}

export function PageHead({ kicker, pre, accent, post, lead, actions, children }) {
  return (
    <header class="page-head reveal">
      <div class="page-head__text">
        {kicker && <p class="kicker">{kicker}</p>}
        <Display pre={pre} accent={accent} post={post} />
        {lead && <p class="lead">{lead}</p>}
        {children}
      </div>
      {actions && <div class="page-head__actions">{actions}</div>}
    </header>
  );
}

export function ExternalLink({ href, children, class: cls }) {
  if (!href) return null;
  return (
    <a class={cx("ext", cls)} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
