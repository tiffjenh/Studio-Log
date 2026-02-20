import { useState } from "react";
import { useStoreContext } from "@/context/StoreContext";
import { Button } from "@/components/ui/Button";

export default function ImportBanner() {
  const { importableLocalData, importLocalData, clearImportableData } = useStoreContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!importableLocalData) return null;
  const { students, lessons } = importableLocalData;
  const count = students.length + lessons.length;
  if (count === 0) return null;

  const handleImport = async () => {
    setError("");
    setLoading(true);
    try {
      await importLocalData();
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Import failed. Try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="card"
      style={{
        marginBottom: 20,
        padding: 16,
        borderLeft: "4px solid var(--primary)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontWeight: 600 }}>Previous data found</div>
      <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
        We found {students.length} student{students.length !== 1 ? "s" : ""} and {lessons.length} lesson{lessons.length !== 1 ? "s" : ""} in this browser. Import them to your account?
      </p>
      {error ? <p style={{ margin: 0, color: "#dc2626", fontSize: 14 }}>{error}</p> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button
          type="button"
          onClick={handleImport}
          disabled={loading}
          variant="primary"
          size="sm"
          loading={loading}
        >
          Import
        </Button>
        <Button
          type="button"
          onClick={clearImportableData}
          disabled={loading}
          variant="secondary"
          size="sm"
        >
          Don&apos;t import
        </Button>
      </div>
    </div>
  );
}
