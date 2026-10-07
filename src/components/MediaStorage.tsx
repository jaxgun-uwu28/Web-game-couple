"use client";
import { useEffect, useState } from "react";
import { useKeepsakes } from "./Keepsakes";
export default function MediaStorage() {
  const c = useKeepsakes(),
    [used, setUsed] = useState(0),
    [cap, setCap] = useState(300),
    [error, setError] = useState("");
  useEffect(() => {
    if (c.preview || !c.db) return;
    void c.db.rpc("media_usage").then((r) => {
      if (r.data) {
        setUsed(Number(r.data.used) / 1048576);
        setCap(Number(r.data.cap) / 1048576);
      }
    });
  }, [c.db, c.preview]);
  return (
    <section className="media-storage">
      <h2>Our storage</h2>
      <p>{used.toFixed(1)} MB used</p>
      <progress
        aria-label="Storage used"
        max={cap}
        value={Math.min(cap, used)}
      />
      <label>
        Shared limit{" "}
        <select
          value={cap}
          onChange={async (e) => {
            const value = Number(e.target.value);
            if (c.preview) {
              setCap(value);
              return;
            }
            const r = await c.db?.rpc("set_media_cap", {
              cap: value * 1048576,
            });
            if (r?.error) setError(r.error.message);
            else setCap(value);
          }}
        >
          {[100, 200, 300, 500, 1000].map((x) => (
            <option key={x} value={x}>
              {x} MB
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
