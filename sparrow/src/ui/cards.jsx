import { useState } from "preact/hooks";
import { BY_ID } from "../../../shared/taxonomy.mjs";
import { api } from "../lib/api.js";
import { collegeMonogram, dayLabel, gradesLabel, label, money, percent, place } from "../lib/format.js";
import { toast } from "../lib/store.js";
import { Icon } from "./icons.jsx";
import { Glass, IconButton, Tag, TypeTile } from "./kit.jsx";

export function MatchTag({ match }) {
  if (!match) return null;
  const tone = match.label === "Great match" ? "great" : match.label === "Good match" ? "blue" : match.label === "Check eligibility" ? "warn" : undefined;
  return (
    <Tag tone={tone} icon={match.label === "Great match" ? "sparkles" : match.label === "Check eligibility" ? "info" : undefined}>
      {match.label}
    </Tag>
  );
}

export function VerifiedTag({ item }) {
  return item.factsVerifiedAt ? (
    <Tag tone="ok" icon="circle-check">
      Verified {dayLabel(item.factsVerifiedAt.slice(0, 10), { year: true })}
    </Tag>
  ) : (
    <Tag icon="info">Check official site for dates & costs</Tag>
  );
}

export function costLabel(item) {
  if (item.cost === "unknown") return "Cost: check site";
  return label("cost", item.cost);
}

/** Saves or un-saves a catalog opportunity; keeps its own optimistic state. */
export function SaveButton({ item, onChange }) {
  const [saved, setSaved] = useState(item.saved);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (saved) {
        await api.del(`/api/saved/${saved.id}`);
        setSaved(null);
        onChange?.(null);
        toast("Removed from your plan.");
      } else {
        const s = await api.post("/api/saved", { opportunityId: item.id });
        setSaved({ id: s.id, status: s.status });
        onChange?.(s);
        toast("Saved to your plan.", "ok");
      }
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <IconButton
      icon={saved ? "bookmark-check" : "bookmark"}
      label={saved ? `Remove ${item.title} from your plan` : `Save ${item.title}`}
      pressed={!!saved}
      onClick={toggle}
      disabled={busy}
    />
  );
}

export function OppCard({ item, reason, onSaved }) {
  const why = reason || item.match?.reasons?.[0];
  return (
    <Glass as="article" class="opp-card" interactive pad={false}>
      <div class="card-top">
        <TypeTile type={item.type} />
        <SaveButton item={item} onChange={onSaved} />
      </div>
      <div class="stack stack--sm">
        <p class="opp-card__provider">{item.provider}</p>
        <h3>
          <a class="stretched" href={`/app/explore/${item.slug}`}>
            {item.title}
          </a>
        </h3>
      </div>
      {(item.match || why) && (
        <p class="opp-card__why">
          <MatchTag match={item.match} />
          {why && <span>{why}</span>}
        </p>
      )}
      <ul class="meta">
        <li>
          <Tag>{label("type", item.type)}</Tag>
        </li>
        <li>
          <Tag>{label("format", item.format)}</Tag>
        </li>
        <li>
          <Tag>{gradesLabel(item.grades)}</Tag>
        </li>
        {item.cost === "free" && (
          <li>
            <Tag tone="ok">Free</Tag>
          </li>
        )}
      </ul>
    </Glass>
  );
}

export function controlLabel(ownership) {
  return ownership === 1 ? "Public" : ownership === 2 ? "Private nonprofit" : "College";
}

export function sizeLabel(size) {
  if (!Number.isFinite(size)) return null;
  return size < 5000 ? "Small" : size < 15000 ? "Medium" : "Large";
}

export function ShortlistButton({ college, onChange }) {
  const [on, setOn] = useState(!!college.shortlist);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (on) {
        await api.del(`/api/shortlist/${college.id}`);
        setOn(false);
        onChange?.(null);
        toast("Removed from your shortlist.");
      } else {
        const c = await api.put(`/api/shortlist/${college.id}`, {});
        setOn(true);
        onChange?.(c.shortlist);
        toast("Added to your shortlist.", "ok");
      }
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <IconButton icon={on ? "bookmark-check" : "bookmark"} label={on ? `Remove ${college.name} from shortlist` : `Shortlist ${college.name}`} pressed={on} onClick={toggle} disabled={busy} />
  );
}

export function CollegeCard({ college, reason, compare }) {
  const why = reason || college.match?.reasons?.[0];
  return (
    <Glass as="article" class="college-card" interactive pad={false}>
      <div class="card-top">
        <span class="monogram" aria-hidden="true">
          {collegeMonogram(college.name)}
        </span>
        <div class="row" style={{ gap: "8px" }}>
          {compare}
          <ShortlistButton college={college} />
        </div>
      </div>
      <div class="stack stack--sm">
        <p class="college-card__place">
          <Icon name="map-pin" size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />
          {place(college.city, college.state)}
        </p>
        <h3>
          <a class="stretched" href={`/app/colleges/${college.id}`}>
            {college.name}
          </a>
        </h3>
      </div>
      {why && <p class="opp-card__why">{why}</p>}
      <ul class="meta">
        <li>
          <Tag>{controlLabel(college.ownership)}</Tag>
        </li>
        {sizeLabel(college.size) && (
          <li>
            <Tag>{sizeLabel(college.size)}</Tag>
          </li>
        )}
        {college.topPrograms?.[0] && (
          <li>
            <Tag tone="blue">{college.topPrograms[0].label}</Tag>
          </li>
        )}
      </ul>
      <div class="stats-line">
        <div>
          <strong>{percent(college.admissionRate)}</strong>
          <span>admitted</span>
        </div>
        <div>
          <strong>{money(college.netPrice)}</strong>
          <span>avg net price</span>
        </div>
        <div>
          <strong>{percent(college.completionRate)}</strong>
          <span>graduate</span>
        </div>
      </div>
    </Glass>
  );
}

export function typeIcon(type) {
  return BY_ID.type[type]?.icon || "sparkles";
}
