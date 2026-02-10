import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { hasSupabase } from "@/lib/supabase";
import { parseLessonCSV, parseLessonMatrixCSV, rowToLesson, type ImportResult } from "@/utils/csvImport";
import type { Student } from "@/types";

export default function Settings() {
  const { data, setUser, updateUserProfile, reload, addLesson } = useStoreContext();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importYear, setImportYear] = useState(new Date().getFullYear());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const matrixFileInputRef = useRef<HTMLInputElement>(null);
  const user = data.user;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [editing, setEditing] = useState<"name" | "email" | "phone" | null>(null);

  const handleSave = async (field: "name" | "email" | "phone") => {
    if (!user) return;
    if (field === "name" && hasSupabase()) {
      await updateUserProfile({ name });
    } else if (field === "phone" && hasSupabase()) {
      await updateUserProfile({ phone });
    } else {
      setUser({ ...user, name: field === "name" ? name : user.name, email: field === "email" ? email : user.email, phone: field === "phone" ? phone : user.phone });
    }
    setEditing(null);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImporting(true);

    try {
      const text = await file.text();
      const parsed = parseLessonCSV(text);
      if (parsed.error) {
        setImportResult({ imported: 0, skipped: 0, errors: [parsed.error] });
        setImporting(false);
        e.target.value = "";
        return;
      }

      const students = data.students;
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < parsed.rows.length; i++) {
        const lessonData = rowToLesson(parsed.rows[i]);
        if (!lessonData) {
          skipped++;
          errors.push(`Row ${i + 2}: Invalid or missing data`);
          continue;
        }

        const student = students.find(
          (s) =>
            s.firstName.toLowerCase().trim() === lessonData.first_name.toLowerCase() &&
            s.lastName.toLowerCase().trim() === lessonData.last_name.toLowerCase()
        );
        if (!student) {
          skipped++;
          errors.push(`Row ${i + 2}: No student named ${lessonData.first_name} ${lessonData.last_name}`);
          continue;
        }

        try {
          const id = await addLesson({
            studentId: student.id,
            date: lessonData.date,
            durationMinutes: lessonData.duration_minutes,
            amountCents: lessonData.amount_cents,
            completed: lessonData.completed,
            note: lessonData.note,
          });
          if (id) imported++;
          else {
            skipped++;
            errors.push(`Row ${i + 2}: Failed to save`);
          }
        } catch {
          skipped++;
          errors.push(`Row ${i + 2}: Failed to save`);
        }
      }

      setImportResult({ imported, skipped, errors });
    } catch (err) {
      setImportResult({ imported: 0, skipped: 0, errors: [err instanceof Error ? err.message : "Import failed"] });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  function matchStudentByName(name: string): Student | undefined {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return undefined;

    const exact = data.students.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase() === name.toLowerCase());
    if (exact) return exact;

    const first = parts[0] ?? "";
    const last = parts.slice(1).join(" ") || first;
    const match = data.students.find(
      (s) =>
        s.firstName.toLowerCase() === first.toLowerCase() &&
        s.lastName.toLowerCase() === last.toLowerCase()
    );
    if (match) return match;

    if (parts.length >= 2) {
      const lastAlt = parts[1]; // "Dylan Chun Chun" -> try first=Dylan, last=Chun
      return data.students.find(
        (s) =>
          s.firstName.toLowerCase() === first.toLowerCase() &&
          s.lastName.toLowerCase() === lastAlt.toLowerCase()
      );
    }
    return undefined;
  }

  const handleMatrixImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImporting(true);

    try {
      const text = await file.text();
      const parsed = parseLessonMatrixCSV(text, importYear);
      if (parsed.error) {
        setImportResult({ imported: 0, skipped: 0, errors: [parsed.error] });
        setImporting(false);
        e.target.value = "";
        return;
      }

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const { date, studentIndex } of parsed.attendance) {
        const name = parsed.studentNames[studentIndex];
        const student = name ? matchStudentByName(name) : undefined;
        if (!student) {
          skipped++;
          if (!errors.some((x) => x.includes(name ?? ""))) errors.push(`No student named "${name}"`);
          continue;
        }

        try {
          const id = await addLesson({
            studentId: student.id,
            date,
            durationMinutes: student.durationMinutes,
            amountCents: student.rateCents,
            completed: true,
          });
          if (id) imported++;
          else { skipped++; errors.push(`Failed: ${name} on ${date}`); }
        } catch {
          skipped++;
          errors.push(`Failed: ${name} on ${date}`);
        }
      }

      setImportResult({ imported, skipped, errors });
    } catch (err) {
      setImportResult({ imported: 0, skipped: 0, errors: [err instanceof Error ? err.message : "Import failed"] });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const handleLogOut = () => {
    if (window.confirm("Are you sure you want to log out?")) {
      setUser(null);
      navigate("/", { replace: true });
    }
  };

  if (!user) return null;

  const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" };
  const inputStyle: React.CSSProperties = { flex: 2, padding: 8, fontSize: 16, border: "1px solid var(--border)", borderRadius: 8 };

  return (
    <>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Settings</h1>
      {hasSupabase() && (
        <div className="card" style={{ marginBottom: 24, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Synced to cloud</div>
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text-muted)" }}>
            Logged in as <strong>{user.email}</strong>. Data is shared across devices when you use this account.
          </p>
          <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", wordBreak: "break-all" }}>
            User ID: {user.id}
          </p>
          <button
            type="button"
            onClick={async () => { setRefreshing(true); await reload(); setRefreshing(false); }}
            disabled={refreshing}
            style={{ padding: "8px 16px", fontSize: 14, border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", cursor: "pointer" }}
          >
            {refreshing ? "Refreshing…" : "Refresh data"}
          </button>
        </div>
      )}
      {!hasSupabase() && (
        <p style={{ marginBottom: 24, fontSize: 14, color: "var(--text-muted)" }}>
          Using local storage. Add Supabase to sync across browsers (see SETUP-SUPABASE.md).
        </p>
      )}
      <div className="card" style={{ marginBottom: 24, padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Import lessons (attendance matrix)</div>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text-muted)" }}>
          First row: student names. First column: dates (e.g. 1/1, 1/4). Put &quot;Y&quot; if they attended. Uses each student&apos;s rate. Students must already exist.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <label style={{ fontSize: 14 }}>
            Year for dates:
            <input
              type="number"
              min={2020}
              max={2030}
              value={importYear}
              onChange={(e) => setImportYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
              style={{ marginLeft: 8, width: 70, padding: 6, border: "1px solid var(--border)", borderRadius: 6 }}
            />
          </label>
          <input
            ref={matrixFileInputRef}
            type="file"
            accept=".csv"
            onChange={handleMatrixImport}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => matrixFileInputRef.current?.click()}
            disabled={importing}
            style={{ padding: "10px 16px", fontSize: 14, border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", cursor: importing ? "not-allowed" : "pointer" }}
          >
            {importing ? "Importing…" : "Import matrix"}
          </button>
        </div>
        {importResult && (
          <div style={{ marginTop: 12, fontSize: 14 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Imported {importResult.imported} lessons, skipped {importResult.skipped}</p>
            {importResult.errors.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: "var(--text-muted)", maxHeight: 120, overflowY: "auto" }}>
                {importResult.errors.slice(0, 10).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {importResult.errors.length > 10 && <li>…and {importResult.errors.length - 10} more</li>}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="card" style={{ marginBottom: 24, padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Import lessons (row format)</div>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text-muted)" }}>
          CSV needs: <code>first_name</code>, <code>last_name</code>, <code>date</code> (YYYY-MM-DD or M/D/YYYY), <code>duration_minutes</code>, <code>amount</code> (dollars) or <code>amount_cents</code>. Optional: <code>completed</code>, <code>note</code>. Students must already exist.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleImport}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          style={{ padding: "10px 16px", fontSize: 14, border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", cursor: importing ? "not-allowed" : "pointer" }}
        >
          {importing ? "Importing…" : "Import CSV"}
        </button>
      </div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={rowStyle}>
          <span style={{ flex: 1 }}>Name</span>
          {editing === "name" ? (
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} onBlur={() => handleSave("name")} autoFocus />
          ) : (
            <span style={{ flex: 2 }}>{user.name}</span>
          )}
          <button type="button" onClick={() => (editing === "name" ? handleSave("name") : setEditing("name"))} style={{ marginLeft: 8, color: "var(--primary)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
            {editing === "name" ? "Save" : "Edit"}
          </button>
        </div>
        <div style={rowStyle}>
          <span style={{ flex: 1 }}>Email</span>
          {editing === "email" ? (
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} onBlur={() => handleSave("email")} autoFocus />
          ) : (
            <span style={{ flex: 2 }}>{user.email}</span>
          )}
          <button type="button" onClick={() => (editing === "email" ? handleSave("email") : setEditing("email"))} style={{ marginLeft: 8, color: "var(--primary)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
            {editing === "email" ? "Save" : "Edit"}
          </button>
        </div>
        <div style={rowStyle}>
          <span style={{ flex: 1 }}>Phone Number</span>
          {editing === "phone" ? (
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} onBlur={() => handleSave("phone")} autoFocus />
          ) : (
            <span style={{ flex: 2 }}>{user.phone || "—"}</span>
          )}
          <button type="button" onClick={() => (editing === "phone" ? handleSave("phone") : setEditing("phone"))} style={{ marginLeft: 8, color: "var(--primary)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
            {editing === "phone" ? "Save" : "Edit"}
          </button>
        </div>
        <div style={{ ...rowStyle, borderBottom: "none" }}>
          <span style={{ flex: 1 }}>Password</span>
          <span style={{ flex: 2 }}>••••••••</span>
          <button type="button" style={{ marginLeft: 8, color: "var(--primary)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>Edit</button>
        </div>
      </div>
      <button type="button" className="btn btn-pink" style={{ width: "100%" }} onClick={handleLogOut}>Log Out</button>
    </>
  );
}
