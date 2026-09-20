"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Phone,
  Copy,
  MoreHorizontal,
  History,
  Trash2,
  Calendar,
  Clock,
  MapPin,
  X,
  Edit2,
  Check,
} from "lucide-react";
import type { Snapshot } from "@/lib/records/store";
import {
  guestSummary,
  guestSummaryLine,
  type Household,
  type Gathering,
} from "@/lib/guests/store";
import {
  rsvpStates,
  rsvpLabels,
  type RsvpState,
} from "@/lib/records/validation";
import {
  canCopy,
  copyText,
  phoneForDialling,
  telHref,
} from "@/lib/contacts/contact-links";
import {
  saveHousehold,
  setHouseholdContacted,
  saveGathering,
} from "@/app/actions";

export type GuestListProps = {
  households: Snapshot["households"];
  gatherings: Snapshot["gatherings"];
  user: { email: string; displayName?: string };
  users: string[];
  onOpenHistory: (id: string) => void;
  onDelete: (id: string, version: number) => void;
  onMessage: (message: string) => void;
  onError: (error: string) => void;
};

function useIsMobile(breakpoint = 700) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setIsMobile(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    if (media.addEventListener) {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    } else {
      media.addListener(listener);
      return () => media.removeListener(listener);
    }
  }, [breakpoint]);
  return isMobile;
}

function userShortName(email: string | null | undefined): string {
  if (!email) return "—";
  const name = email.split("@")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatContactedStamp(
  contactedAt: string | null,
  contactedBy: string | null,
): string {
  if (!contactedAt) return "";
  try {
    const d = new Date(contactedAt);
    const day = d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "Europe/London",
    });
    const by = userShortName(contactedBy);
    return `${day} ${by}`;
  } catch {
    return "Contacted";
  }
}

export function GuestList({
  households,
  gatherings,
  user,
  users,
  onOpenHistory,
  onDelete,
  onMessage,
  onError,
}: GuestListProps) {
  const router = useRouter();
  const isMobile = useIsMobile(700);

  // Filter states
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [sort, setSort] = useState<string>("added");

  // Summary
  const summary = guestSummary(households);
  const summaryText = guestSummaryLine(summary);

  // Filter & sort households
  const filtered = households.filter((h) => {
    if (filter === "still_to_ring" && h.contactedAt !== null) return false;
    if (filter === "awaiting_reply_funeral" && h.funeral !== "awaiting_reply")
      return false;
    if (filter === "awaiting_reply_wake" && h.wake !== "awaiting_reply")
      return false;
    if (
      filter === "awaiting_reply" &&
      h.funeral !== "awaiting_reply" &&
      h.wake !== "awaiting_reply"
    )
      return false;
    if (filter === "coming_funeral" && h.funeral !== "coming") return false;
    if (filter === "coming_wake" && h.wake !== "coming") return false;
    if (filter === "mine" && h.ringing !== user.email) return false;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchName = h.name.toLowerCase().includes(q);
      const matchRel = (h.relationship ?? "").toLowerCase().includes(q);
      const matchNotes = (h.notes ?? "").toLowerCase().includes(q);
      const matchPhone = (h.phone ?? "").toLowerCase().includes(q);
      if (!matchName && !matchRel && !matchNotes && !matchPhone) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "name") {
      return a.name.localeCompare(b.name);
    }
    if (sort === "awaiting_first") {
      const aAwaiting =
        a.funeral === "awaiting_reply" || a.wake === "awaiting_reply";
      const bAwaiting =
        b.funeral === "awaiting_reply" || b.wake === "awaiting_reply";
      if (aAwaiting && !bAwaiting) return -1;
      if (!aAwaiting && bAwaiting) return 1;
      return 0;
    }
    // Added order (default, stable by array index)
    return 0;
  });

  return (
    <div className="guest-page">
      {/* Gathering facts strip at top */}
      <GatheringStrip
        gatherings={gatherings}
        onSave={async (gathering) => {
          const res = await saveGathering(gathering);
          if (res.ok) {
            router.refresh();
          } else {
            onError(res.error);
          }
        }}
      />

      {isMobile ? (
        <CallSheetView
          households={sorted}
          user={user}
          users={users}
          filter={filter}
          setFilter={setFilter}
          search={search}
          setSearch={setSearch}
          summary={summary}
          onOpenHistory={onOpenHistory}
          onError={onError}
          onMessage={onMessage}
        />
      ) : (
        <GridView
          households={sorted}
          user={user}
          users={users}
          filter={filter}
          setFilter={setFilter}
          search={search}
          setSearch={setSearch}
          sort={sort}
          setSort={setSort}
          summaryText={summaryText}
          onOpenHistory={onOpenHistory}
          onDelete={onDelete}
          onMessage={onMessage}
          onError={onError}
        />
      )}
    </div>
  );
}

// =============================================================================
// Gathering Details Strip
// =============================================================================
function GatheringStrip({
  gatherings,
  onSave,
}: {
  gatherings: Snapshot["gatherings"];
  onSave: (gathering: Gathering) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const funeral = gatherings.find((g) => g.id === "funeral");
  const wake = gatherings.find((g) => g.id === "wake");

  const [funeralDraft, setFuneralDraft] = useState({
    date: funeral?.date ?? "",
    time: funeral?.time ?? "",
    place: funeral?.place ?? "",
  });

  const [wakeDraft, setWakeDraft] = useState({
    date: wake?.date ?? "",
    time: wake?.time ?? "",
    place: wake?.place ?? "",
  });

  useEffect(() => {
    if (funeral) {
      setFuneralDraft({
        date: funeral.date ?? "",
        time: funeral.time ?? "",
        place: funeral.place ?? "",
      });
    }
  }, [funeral?.date, funeral?.time, funeral?.place]);

  useEffect(() => {
    if (wake) {
      setWakeDraft({
        date: wake.date ?? "",
        time: wake.time ?? "",
        place: wake.place ?? "",
      });
    }
  }, [wake?.date, wake?.time, wake?.place]);

  async function handleSave() {
    if (funeral) {
      await onSave({
        ...funeral,
        date: funeralDraft.date || null,
        time: funeralDraft.time || null,
        place: funeralDraft.place || null,
      });
    }
    if (wake) {
      await onSave({
        ...wake,
        date: wakeDraft.date || null,
        time: wakeDraft.time || null,
        place: wakeDraft.place || null,
      });
    }
    setEditing(false);
  }

  function formatDisplayDate(isoDate: string | null | undefined): string {
    if (!isoDate) return "Date to be set";
    try {
      const [y, m, d] = isoDate.split("-");
      if (y && m && d) {
        const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
        return dateObj.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }
      return isoDate;
    } catch {
      return isoDate;
    }
  }

  return (
    <div className="gathering-strip">
      <div style={{ display: "flex", flex: 1, flexWrap: "wrap", gap: "16px" }}>
        {/* Funeral */}
        <div className="gathering-item">
          <strong>Funeral:</strong>
          {editing ? (
            <>
              <input
                type="date"
                value={funeralDraft.date}
                onChange={(e) =>
                  setFuneralDraft((d) => ({ ...d, date: e.target.value }))
                }
                className="gathering-input"
                aria-label="Funeral date"
              />
              <input
                type="text"
                placeholder="Time (e.g. 11:30)"
                value={funeralDraft.time}
                onChange={(e) =>
                  setFuneralDraft((d) => ({ ...d, time: e.target.value }))
                }
                className="gathering-input"
                style={{ width: "110px" }}
                aria-label="Funeral time"
              />
              <input
                type="text"
                placeholder="Place"
                value={funeralDraft.place}
                onChange={(e) =>
                  setFuneralDraft((d) => ({ ...d, place: e.target.value }))
                }
                className="gathering-input"
                style={{ width: "220px" }}
                aria-label="Funeral place"
              />
            </>
          ) : (
            <span>
              {formatDisplayDate(funeral?.date)}
              {funeral?.time ? ` · ${funeral.time}` : ""}
              {funeral?.place ? ` · ${funeral.place}` : ""}
            </span>
          )}
        </div>

        {/* Wake */}
        <div className="gathering-item">
          <strong>Wake:</strong>
          {editing ? (
            <>
              <input
                type="date"
                value={wakeDraft.date}
                onChange={(e) =>
                  setWakeDraft((d) => ({ ...d, date: e.target.value }))
                }
                className="gathering-input"
                aria-label="Wake date"
              />
              <input
                type="text"
                placeholder="Time (e.g. 13:00)"
                value={wakeDraft.time}
                onChange={(e) =>
                  setWakeDraft((d) => ({ ...d, time: e.target.value }))
                }
                className="gathering-input"
                style={{ width: "110px" }}
                aria-label="Wake time"
              />
              <input
                type="text"
                placeholder="Place"
                value={wakeDraft.place}
                onChange={(e) =>
                  setWakeDraft((d) => ({ ...d, place: e.target.value }))
                }
                className="gathering-input"
                style={{ width: "220px" }}
                aria-label="Wake place"
              />
            </>
          ) : (
            <span>
              {formatDisplayDate(wake?.date)}
              {wake?.time ? ` · ${wake.time}` : ""}
              {wake?.place ? ` · ${wake.place}` : ""}
            </span>
          )}
        </div>
      </div>

      <div style={{ marginLeft: "auto" }}>
        {editing ? (
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              onClick={handleSave}
              className="subtle-button"
              style={{
                padding: "2px 8px",
                fontSize: "12px",
                background: "var(--accent)",
              }}
            >
              <Check size={13} style={{ marginRight: "4px" }} />
              Save details
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="subtle-button"
              style={{ padding: "2px 6px", fontSize: "12px" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="subtle-button"
            title="Edit funeral and wake details"
            style={{ padding: "2px 8px", fontSize: "12px" }}
          >
            <Edit2 size={12} style={{ marginRight: "4px" }} />
            Edit details
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// PC Spreadsheet Grid View
// =============================================================================
function GridView({
  households,
  user,
  users,
  filter,
  setFilter,
  search,
  setSearch,
  sort,
  setSort,
  summaryText,
  onOpenHistory,
  onDelete,
  onMessage,
  onError,
}: {
  households: Household[];
  user: { email: string };
  users: string[];
  filter: string;
  setFilter: (f: string) => void;
  search: string;
  setSearch: (s: string) => void;
  sort: string;
  setSort: (s: string) => void;
  summaryText: string;
  onOpenHistory: (id: string) => void;
  onDelete: (id: string, version: number) => void;
  onMessage: (msg: string) => void;
  onError: (err: string) => void;
}) {
  const router = useRouter();

  // Blank row state for fast data entry
  const [blankDraft, setBlankDraft] = useState({
    name: "",
    partySize: 1,
    phone: "",
    email: "",
    relationship: "",
    ringing: "",
    funeral: "not_asked" as RsvpState,
    wake: "not_asked" as RsvpState,
    notes: "",
  });

  const [savingBlank, setSavingBlank] = useState(false);
  const blankNameRef = useRef<HTMLInputElement>(null);

  async function commitBlank() {
    if (savingBlank) return;
    const trimmed = blankDraft.name.trim();
    if (!trimmed) return;

    setSavingBlank(true);
    try {
      const res = await saveHousehold({
        name: trimmed,
        partySize: Number(blankDraft.partySize) || 1,
        phone: blankDraft.phone || null,
        email: blankDraft.email || null,
        relationship: blankDraft.relationship || null,
        ringing: blankDraft.ringing || null,
        funeral: blankDraft.funeral,
        wake: blankDraft.wake,
        notes: blankDraft.notes || null,
      });

      if (res.ok) {
        setBlankDraft({
          name: "",
          partySize: 1,
          phone: "",
          email: "",
          relationship: "",
          ringing: "",
          funeral: "not_asked",
          wake: "not_asked",
          notes: "",
        });
        router.refresh();
      } else {
        onError(res.error);
      }
    } finally {
      setSavingBlank(false);
    }
  }

  return (
    <>
      {/* Summary strip, 1 line */}
      <div className="guest-summary-strip" aria-label="Summary totals">
        {summaryText}
      </div>

      {/* Toolbar: filter dropdown, sort dropdown, search */}
      <div className="guest-toolbar">
        <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            Filter:
          </span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="guest-select"
            aria-label="Filter households"
          >
            <option value="all">Everyone</option>
            <option value="still_to_ring">Still to ring</option>
            <option value="awaiting_reply_funeral">
              Awaiting reply (funeral)
            </option>
            <option value="awaiting_reply_wake">Awaiting reply (wake)</option>
            <option value="coming_funeral">Coming to the funeral</option>
            <option value="coming_wake">Coming to the wake</option>
            <option value="mine">Mine</option>
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            Order:
          </span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="guest-select"
            aria-label="Sort households"
          >
            <option value="added">Added order</option>
            <option value="name">A–Z</option>
            <option value="awaiting_first">Awaiting reply first</option>
          </select>
        </label>

        <input
          type="search"
          placeholder="Search name, relationship, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="guest-search"
          aria-label="Search households"
        />

        <div
          style={{
            marginLeft: "auto",
            fontSize: "12px",
            color: "var(--muted)",
          }}
        >
          Showing {households.length} household
          {households.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Dense Spreadsheet Table */}
      <div className="guest-grid-container">
        <table
          className="guest-grid"
          aria-label="Family and friends guest list"
        >
          <thead>
            <tr>
              <th style={{ width: "220px", minWidth: "170px" }}>Household</th>
              <th style={{ width: "60px", textAlign: "center" }}>Party</th>
              <th style={{ width: "140px" }}>Phone</th>
              <th style={{ width: "170px" }}>Email</th>
              <th style={{ width: "150px" }}>Relationship</th>
              <th style={{ width: "100px" }}>Ringing</th>
              <th style={{ width: "115px", textAlign: "center" }}>Contacted</th>
              <th style={{ width: "135px" }}>Funeral</th>
              <th style={{ width: "135px" }}>Wake</th>
              <th className="col-notes" style={{ minWidth: "180px" }}>
                Notes
              </th>
              <th
                style={{ width: "40px", textAlign: "center" }}
                aria-label="Row actions"
              ></th>
            </tr>
          </thead>
          <tbody>
            {households.map((h) => (
              <GridRow
                key={h.id}
                household={h}
                users={users}
                user={user}
                onOpenHistory={onOpenHistory}
                onDelete={onDelete}
                onMessage={onMessage}
                onError={onError}
              />
            ))}

            {/* The Blank Last Row for continuous fast typing */}
            <tr className="new-row">
              <td>
                <input
                  ref={blankNameRef}
                  type="text"
                  placeholder="New household…"
                  value={blankDraft.name}
                  onChange={(e) =>
                    setBlankDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  onBlur={commitBlank}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitBlank();
                    }
                  }}
                  className="guest-cell-input"
                  aria-label="Add new household"
                />
              </td>
              <td>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={blankDraft.partySize}
                  onChange={(e) =>
                    setBlankDraft((d) => ({
                      ...d,
                      partySize: parseInt(e.target.value, 10) || 1,
                    }))
                  }
                  onBlur={commitBlank}
                  className="guest-cell-input"
                  style={{ textAlign: "center" }}
                  aria-label="New household party size"
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="Phone"
                  value={blankDraft.phone}
                  onChange={(e) =>
                    setBlankDraft((d) => ({ ...d, phone: e.target.value }))
                  }
                  onBlur={commitBlank}
                  className="guest-cell-input"
                  aria-label="New household phone"
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="Email"
                  value={blankDraft.email}
                  onChange={(e) =>
                    setBlankDraft((d) => ({ ...d, email: e.target.value }))
                  }
                  onBlur={commitBlank}
                  className="guest-cell-input"
                  aria-label="New household email"
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="Relationship"
                  value={blankDraft.relationship}
                  onChange={(e) =>
                    setBlankDraft((d) => ({
                      ...d,
                      relationship: e.target.value,
                    }))
                  }
                  onBlur={commitBlank}
                  className="guest-cell-input"
                  aria-label="New household relationship"
                />
              </td>
              <td>
                <select
                  value={blankDraft.ringing}
                  onChange={(e) =>
                    setBlankDraft((d) => ({ ...d, ringing: e.target.value }))
                  }
                  onBlur={commitBlank}
                  className="guest-cell-select"
                  aria-label="New household ringing assignment"
                >
                  <option value="">—</option>
                  {users.map((u) => (
                    <option key={u} value={u}>
                      {userShortName(u)}
                    </option>
                  ))}
                </select>
              </td>
              <td style={{ textAlign: "center" }}>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                  —
                </span>
              </td>
              <td>
                <select
                  value={blankDraft.funeral}
                  onChange={(e) =>
                    setBlankDraft((d) => ({
                      ...d,
                      funeral: e.target.value as RsvpState,
                    }))
                  }
                  onBlur={commitBlank}
                  className="guest-cell-select"
                  aria-label="New household funeral RSVP"
                >
                  {rsvpStates.map((st) => (
                    <option key={st} value={st}>
                      {rsvpLabels[st]}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select
                  value={blankDraft.wake}
                  onChange={(e) =>
                    setBlankDraft((d) => ({
                      ...d,
                      wake: e.target.value as RsvpState,
                    }))
                  }
                  onBlur={commitBlank}
                  className="guest-cell-select"
                  aria-label="New household wake RSVP"
                >
                  {rsvpStates.map((st) => (
                    <option key={st} value={st}>
                      {rsvpLabels[st]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="cell-notes">
                <input
                  type="text"
                  placeholder="Notes"
                  value={blankDraft.notes}
                  onChange={(e) =>
                    setBlankDraft((d) => ({ ...d, notes: e.target.value }))
                  }
                  onBlur={commitBlank}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitBlank();
                    }
                  }}
                  className="guest-cell-input"
                  aria-label="New household notes"
                />
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

// =============================================================================
// Grid Single Row Component (with optimistic cell saves)
// =============================================================================
function GridRow({
  household,
  users,
  user,
  onOpenHistory,
  onDelete,
  onMessage,
  onError,
}: {
  household: Household;
  users: string[];
  user: { email: string };
  onOpenHistory: (id: string) => void;
  onDelete: (id: string, version: number) => void;
  onMessage: (msg: string) => void;
  onError: (err: string) => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Local text drafts for smooth typing
  const [name, setName] = useState(household.name);
  const [partySize, setPartySize] = useState(String(household.partySize ?? 1));
  const [phone, setPhone] = useState(household.phone ?? "");
  const [email, setEmail] = useState(household.email ?? "");
  const [relationship, setRelationship] = useState(
    household.relationship ?? "",
  );
  const [notes, setNotes] = useState(household.notes ?? "");

  const [flashSaved, setFlashSaved] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);

  useEffect(() => {
    setName(household.name);
    setPartySize(String(household.partySize ?? 1));
    setPhone(household.phone ?? "");
    setEmail(household.email ?? "");
    setRelationship(household.relationship ?? "");
    setNotes(household.notes ?? "");
    setConflictError(null);
  }, [household]);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  async function saveField(patch: Partial<Household>) {
    setConflictError(null);
    const payload = {
      ...household,
      name,
      partySize: parseInt(partySize, 10) || 1,
      phone: phone || null,
      email: email || null,
      relationship: relationship || null,
      notes: notes || null,
      ...patch,
    };

    const res = await saveHousehold(payload);
    if (res.ok) {
      setFlashSaved(true);
      setTimeout(() => setFlashSaved(false), 1200);
      router.refresh();
    } else {
      setConflictError(res.error);
      onError(res.error);
      // Revert local values from prop on failure
      setName(household.name);
      setPartySize(String(household.partySize ?? 1));
      setPhone(household.phone ?? "");
      setEmail(household.email ?? "");
      setRelationship(household.relationship ?? "");
      setNotes(household.notes ?? "");
    }
  }

  async function handleContactedToggle(checked: boolean) {
    setConflictError(null);
    const res = await setHouseholdContacted({
      id: household.id,
      contacted: checked,
      version: household.version,
    });
    if (res.ok) {
      setFlashSaved(true);
      setTimeout(() => setFlashSaved(false), 1200);
      router.refresh();
    } else {
      setConflictError(res.error);
      onError(res.error);
    }
  }

  return (
    <tr>
      {/* Household Name */}
      <td>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() !== household.name) {
              if (!name.trim()) {
                setName(household.name);
              } else {
                saveField({ name: name.trim() });
              }
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className="guest-cell-input"
          aria-label={`Household name for ${household.name}`}
        />
        {conflictError && (
          <div className="guest-row-status guest-row-error" role="alert">
            {conflictError}
          </div>
        )}
      </td>

      {/* Party size */}
      <td>
        <input
          type="number"
          min="1"
          max="100"
          value={partySize}
          onChange={(e) => setPartySize(e.target.value)}
          onBlur={() => {
            const val = parseInt(partySize, 10);
            if (val !== household.partySize && val >= 1) {
              saveField({ partySize: val });
            } else if (val < 1) {
              setPartySize(String(household.partySize));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="guest-cell-input"
          style={{ textAlign: "center" }}
          aria-label={`Party size for ${household.name}`}
        />
      </td>

      {/* Phone */}
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => {
              if (phone !== (household.phone ?? "")) {
                saveField({ phone: phone.trim() || null });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="guest-cell-input"
            aria-label={`Phone for ${household.name}`}
          />
          {canCopy(phone) && (
            <button
              type="button"
              className="guest-row-menu-btn"
              title="Copy phone number"
              onClick={async () => {
                const ok = await copyText(phone);
                if (ok) onMessage("Phone number copied");
              }}
            >
              <Copy size={12} />
            </button>
          )}
        </div>
      </td>

      {/* Email */}
      <td>
        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => {
            if (email !== (household.email ?? "")) {
              saveField({ email: email.trim() || null });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="guest-cell-input"
          aria-label={`Email for ${household.name}`}
        />
      </td>

      {/* Relationship */}
      <td>
        <input
          type="text"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          onBlur={() => {
            if (relationship !== (household.relationship ?? "")) {
              saveField({ relationship: relationship.trim() || null });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="guest-cell-input"
          aria-label={`Relationship for ${household.name}`}
        />
      </td>

      {/* Ringing (Alex / Jamie / —) */}
      <td>
        <select
          value={household.ringing ?? ""}
          onChange={(e) => {
            saveField({ ringing: e.target.value || null });
          }}
          className="guest-cell-select"
          aria-label={`Ringing assignee for ${household.name}`}
        >
          <option value="">—</option>
          {users.map((u) => (
            <option key={u} value={u}>
              {userShortName(u)}
            </option>
          ))}
        </select>
      </td>

      {/* Contacted checkbox + stamp */}
      <td>
        <div className="guest-contacted-cell">
          <input
            type="checkbox"
            checked={household.contactedAt !== null}
            onChange={(e) => handleContactedToggle(e.target.checked)}
            title="Mark as contacted"
            aria-label={`Contacted status for ${household.name}`}
            style={{ cursor: "pointer", width: "16px", height: "16px" }}
          />
          {household.contactedAt && (
            <span style={{ fontSize: "10px", color: "var(--muted)" }}>
              {formatContactedStamp(
                household.contactedAt,
                household.contactedBy,
              )}
            </span>
          )}
        </div>
      </td>

      {/* Funeral RSVP */}
      <td>
        <select
          value={household.funeral}
          onChange={(e) => {
            saveField({ funeral: e.target.value as RsvpState });
          }}
          className="guest-cell-select"
          aria-label={`Funeral RSVP for ${household.name}`}
        >
          {rsvpStates.map((st) => (
            <option key={st} value={st}>
              {rsvpLabels[st]}
            </option>
          ))}
        </select>
      </td>

      {/* Wake RSVP */}
      <td>
        <select
          value={household.wake}
          onChange={(e) => {
            saveField({ wake: e.target.value as RsvpState });
          }}
          className="guest-cell-select"
          aria-label={`Wake RSVP for ${household.name}`}
        >
          {rsvpStates.map((st) => (
            <option key={st} value={st}>
              {rsvpLabels[st]}
            </option>
          ))}
        </select>
      </td>

      {/* Notes */}
      <td className="cell-notes">
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (household.notes ?? "")) {
                saveField({ notes: notes.trim() || null });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="guest-cell-input"
            aria-label={`Notes for ${household.name}`}
          />
          {flashSaved && (
            <span className="guest-row-status guest-row-saved">Saved</span>
          )}
        </div>
      </td>

      {/* Row end actions menu */}
      <td style={{ textAlign: "center", position: "relative" }}>
        <div ref={menuRef} style={{ display: "inline-block" }}>
          <button
            type="button"
            className="guest-row-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            title="Row options"
            aria-label={`Options for ${household.name}`}
          >
            <MoreHorizontal size={15} />
          </button>
          {menuOpen && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "100%",
                zIndex: 20,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                padding: "4px 0",
                minWidth: "120px",
                textAlign: "left",
              }}
            >
              <button
                type="button"
                className="subtle-button full-width"
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onClick={() => {
                  setMenuOpen(false);
                  onOpenHistory(household.id);
                }}
              >
                <History size={13} />
                History
              </button>
              <button
                type="button"
                className="subtle-button danger full-width"
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(household.id, household.version);
                }}
              >
                <Trash2 size={13} />
                Move to bin
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// =============================================================================
// Phone Call Sheet View (<= 700px)
// =============================================================================
function CallSheetView({
  households,
  user,
  users,
  filter,
  setFilter,
  search,
  setSearch,
  summary,
  onOpenHistory,
  onError,
  onMessage,
}: {
  households: Household[];
  user: { email: string };
  users: string[];
  filter: string;
  setFilter: (f: string) => void;
  search: string;
  setSearch: (s: string) => void;
  summary: ReturnType<typeof guestSummary>;
  onOpenHistory: (id: string) => void;
  onError: (err: string) => void;
  onMessage: (msg: string) => void;
}) {
  const router = useRouter();
  const [activeCard, setActiveCard] = useState<Household | null>(null);

  // Default to still_to_ring on mobile call sheet if filter is 'all'
  useEffect(() => {
    if (filter === "all") {
      setFilter("still_to_ring");
    }
  }, []);

  async function handleContactedToggle(household: Household, checked: boolean) {
    const res = await setHouseholdContacted({
      id: household.id,
      contacted: checked,
      version: household.version,
    });
    if (res.ok) {
      router.refresh();
    } else {
      onError(res.error);
    }
  }

  return (
    <div className="call-sheet">
      {/* 4 filter tabs: Still to ring (default), Mine, Awaiting reply, All */}
      <div
        className="call-filters"
        role="tablist"
        aria-label="Call sheet filters"
      >
        <button
          type="button"
          className={`call-filter-tab ${filter === "still_to_ring" ? "active" : ""}`}
          onClick={() => setFilter("still_to_ring")}
        >
          Still to ring ({summary.stillToRingCount})
        </button>
        <button
          type="button"
          className={`call-filter-tab ${filter === "mine" ? "active" : ""}`}
          onClick={() => setFilter("mine")}
        >
          Mine
        </button>
        <button
          type="button"
          className={`call-filter-tab ${filter === "awaiting_reply" ? "active" : ""}`}
          onClick={() => setFilter("awaiting_reply")}
        >
          Awaiting reply ({summary.awaitingReplyCount})
        </button>
        <button
          type="button"
          className={`call-filter-tab ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All ({summary.totalHouseholds})
        </button>
      </div>

      <input
        type="search"
        placeholder="Search names or notes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="guest-search full-width"
        style={{ height: "38px", fontSize: "14px" }}
        aria-label="Search call sheet"
      />

      {/* Call sheet rows: thumb sized, name left, dial button right, contacted tick */}
      <div className="call-sheet-list">
        {households.length === 0 ? (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              color: "var(--muted)",
            }}
          >
            No households match this filter.
          </div>
        ) : (
          households.map((h) => {
            const dialLink = telHref(h.phone);
            const dialDisplay = h.phone ? phoneForDialling(h.phone) : null;
            const isContacted = h.contactedAt !== null;

            return (
              <div className="call-sheet-row" key={h.id}>
                {/* Tappable name left */}
                <button
                  type="button"
                  className="call-info-btn"
                  onClick={() => setActiveCard(h)}
                  title="View household details"
                >
                  <span className="call-name">{h.name}</span>
                  <span className="call-subtext">
                    {h.partySize > 1 ? `Party of ${h.partySize} · ` : ""}
                    {h.relationship ? `${h.relationship} · ` : ""}
                    {isContacted
                      ? formatContactedStamp(h.contactedAt, h.contactedBy)
                      : "Not contacted"}
                  </span>
                </button>

                {/* Dial button right + Contacted tick */}
                <div className="call-actions">
                  {dialLink ? (
                    <a
                      href={dialLink}
                      className="call-dial-link"
                      title="Tap to dial"
                    >
                      <Phone size={16} />
                      <span>{dialDisplay}</span>
                    </a>
                  ) : (
                    <span className="call-no-dial">No phone</span>
                  )}

                  <input
                    type="checkbox"
                    checked={isContacted}
                    onChange={(e) => handleContactedToggle(h, e.target.checked)}
                    className="call-contacted-checkbox"
                    title={isContacted ? "Contacted" : "Mark contacted"}
                    aria-label={`Mark ${h.name} as contacted`}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Read-Only Modal Card for Mid-Call Reference */}
      {activeCard && (
        <div
          className="call-modal-backdrop"
          onClick={() => setActiveCard(null)}
        >
          <div
            className="call-modal-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Household details"
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "12px",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "18px" }}>
                  {activeCard.name}
                </h3>
                <p
                  style={{
                    margin: "4px 0 0",
                    color: "var(--muted)",
                    fontSize: "13px",
                  }}
                >
                  Party size: {activeCard.partySize}
                </p>
              </div>
              <button
                type="button"
                className="subtle-button"
                onClick={() => setActiveCard(null)}
                aria-label="Close details"
              >
                <X size={20} />
              </button>
            </div>

            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr",
                gap: "8px",
                fontSize: "14px",
                margin: 0,
              }}
            >
              <dt style={{ color: "var(--muted)" }}>Phone:</dt>
              <dd style={{ margin: 0 }}>
                {activeCard.phone ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span>{activeCard.phone}</span>
                    {canCopy(activeCard.phone) && (
                      <button
                        type="button"
                        className="subtle-button"
                        style={{ padding: "2px 6px" }}
                        onClick={async () => {
                          const ok = await copyText(activeCard.phone);
                          if (ok) onMessage("Phone copied");
                        }}
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                ) : (
                  "—"
                )}
              </dd>

              <dt style={{ color: "var(--muted)" }}>Email:</dt>
              <dd style={{ margin: 0 }}>{activeCard.email || "—"}</dd>

              <dt style={{ color: "var(--muted)" }}>Relationship:</dt>
              <dd style={{ margin: 0 }}>{activeCard.relationship || "—"}</dd>

              <dt style={{ color: "var(--muted)" }}>Ringing:</dt>
              <dd style={{ margin: 0 }}>{userShortName(activeCard.ringing)}</dd>

              <dt style={{ color: "var(--muted)" }}>Contacted:</dt>
              <dd style={{ margin: 0 }}>
                {activeCard.contactedAt
                  ? formatContactedStamp(
                      activeCard.contactedAt,
                      activeCard.contactedBy,
                    )
                  : "Not yet"}
              </dd>

              <dt style={{ color: "var(--muted)" }}>Funeral:</dt>
              <dd style={{ margin: 0 }}>
                {rsvpLabels[activeCard.funeral as RsvpState] ||
                  activeCard.funeral}
              </dd>

              <dt style={{ color: "var(--muted)" }}>Wake:</dt>
              <dd style={{ margin: 0 }}>
                {rsvpLabels[activeCard.wake as RsvpState] || activeCard.wake}
              </dd>

              <dt style={{ color: "var(--muted)" }}>Notes:</dt>
              <dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {activeCard.notes || "No notes"}
              </dd>
            </dl>

            <div
              style={{
                marginTop: "18px",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                className="subtle-button"
                onClick={() => {
                  const id = activeCard.id;
                  setActiveCard(null);
                  onOpenHistory(id);
                }}
                style={{ display: "flex", alignItems: "center", gap: "4px" }}
              >
                <History size={14} />
                View history
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
