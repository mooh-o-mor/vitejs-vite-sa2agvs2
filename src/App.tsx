"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

/* ============================= */
/*          SUPABASE             */
/* ============================= */

const supabase = createClient(
  "https://otjiwxvszomwpqmwusqd.supabase.co",
  "sb_publishable_P2rqYUz4DyEuwEiFGs3nBQ_s1DK3JXh"
);

/* ============================= */
/*            CONSTS             */
/* ============================= */

const YEAR = 2026;

const yearStart = new Date(YEAR, 0, 1);
const yearEnd = new Date(YEAR, 11, 31);
const MS = 86400000;
const totalDays =
  Math.floor((yearEnd.getTime() - yearStart.getTime()) / MS) + 1;

const COLORS = [
  "#1D4ED8","#059669","#D97706","#DC2626","#7C3AED",
  "#DB2777","#0891B2","#65A30D","#EA580C","#4F46E5"
];

/* ============================= */
/*         SAFE DATE             */
/* ============================= */

function safeDate(dateStr: string) {
  const clean = dateStr.split("T")[0];
  const [y, m, d] = clean.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function contractDaysYearBounded(start: string, end: string) {
  const s = safeDate(start);
  const e = safeDate(end);

  if (e < s) return 0;

  const clampedStart = new Date(Math.max(s.getTime(), yearStart.getTime()));
  const clampedEnd = new Date(Math.min(e.getTime(), yearEnd.getTime()));

  if (clampedEnd < clampedStart) return 0;

  return Math.floor((clampedEnd.getTime() - clampedStart.getTime()) / MS) + 1;
}

function contractDaysRaw(start: string, end: string) {
  const s = safeDate(start);
  const e = safeDate(end);
  if (e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / MS) + 1;
}

/* ============================= */
/*         TYPES                 */
/* ============================= */

interface Vessel {
  id: number;
  name: string;
  branch: string;
}

interface Contract {
  id: number;
  vesselId: number;
  counterparty: string;
  start: string;
  end: string;
  rate: number;
  mob: number;
  demob: number;
}

/* ============================= */
/*            APP                */
/* ============================= */

export default function App() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  /* ============================= */
  /*          LOAD DATA            */
  /* ============================= */

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const [{ data: vData }, { data: cData }] = await Promise.all([
      supabase.from("vessels").select("*").order("id"),
      supabase.from("contracts").select("*").order("id"),
    ]);

    setVessels(
      (vData || []).map((v: any) => ({
        id: v.id,
        name: v.name,
        branch: v.branch || "",
      }))
    );

    setContracts(
      (cData || []).map((c: any) => ({
        id: c.id,
        vesselId: c.vessel_id,
        counterparty: c.counterparty,
        start: c.start_date,
        end: c.end_date,
        rate: Number(c.rate || 0),
        mob: Number(c.mob || 0),
        demob: Number(c.demob || 0),
      }))
    );

    setLoading(false);
  }

  /* ============================= */
  /*         CONTRACT SAVE         */
  /* ============================= */

  async function addContract(data: Omit<Contract, "id">) {
    setSyncing(true);

    await supabase.from("contracts").insert({
      vessel_id: data.vesselId,
      counterparty: data.counterparty,
      start_date: data.start,
      end_date: data.end,
      rate: Number(data.rate || 0),
      mob: Number(data.mob || 0),
      demob: Number(data.demob || 0),
    });

    setSyncing(false);
    await loadData();
  }

  async function updateContract(id: number, data: Omit<Contract, "id">) {
    setSyncing(true);

    await supabase
      .from("contracts")
      .update({
        vessel_id: data.vesselId,
        counterparty: data.counterparty,
        start_date: data.start,
        end_date: data.end,
        rate: Number(data.rate || 0),
        mob: Number(data.mob || 0),
        demob: Number(data.demob || 0),
      })
      .eq("id", id);

    setSyncing(false);
    await loadData();
  }

  async function deleteContract(id: number) {
    setSyncing(true);
    await supabase.from("contracts").delete().eq("id", id);
    setSyncing(false);
    await loadData();
  }

  /* ============================= */
  /*          VESSELS              */
  /* ============================= */

  async function addVessel(name: string, branch: string) {
    if (!name.trim()) return;

    setSyncing(true);

    await supabase.from("vessels").insert({
      name: name.trim(),
      branch: branch.trim(),
    });

    setSyncing(false);
    await loadData();
  }

  async function updateVessel(id: number, name: string, branch: string) {
    setSyncing(true);

    await supabase
      .from("vessels")
      .update({ name, branch })
      .eq("id", id);

    setSyncing(false);
    await loadData();
  }

  async function deleteVessel(id: number) {
    setSyncing(true);

    await supabase.from("contracts").delete().eq("vessel_id", id);
    await supabase.from("vessels").delete().eq("id", id);

    setSyncing(false);
    await loadData();
  }

  /* ============================= */
  /*         REVENUE LOGIC         */
  /* ============================= */

  const totalRevenue = contracts.reduce((sum, c) => {
    const days = contractDaysYearBounded(c.start, c.end);
    return sum + days * c.rate + c.mob + c.demob;
  }, 0);

  /* ============================= */
  /*            RENDER             */
  /* ============================= */

  if (loading) {
    return (
      <div style={{ padding: 40 }}>
        Loading fleet data...
      </div>
    );
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>⚓ Fleet {YEAR}</h1>

      <div style={{ marginBottom: 20 }}>
        <strong>Total Revenue (Year bounded):</strong>{" "}
        {new Intl.NumberFormat("ru-RU").format(totalRevenue)} ₽
      </div>

      <div>
        {vessels.map((v) => {
          const vesselContracts = contracts.filter(
            (c) => c.vesselId === v.id
          );

          const vesselRevenue = vesselContracts.reduce((sum, c) => {
            const days = contractDaysYearBounded(c.start, c.end);
            return sum + days * c.rate + c.mob + c.demob;
          }, 0);

          return (
            <div
              key={v.id}
              style={{
                border: "1px solid #ddd",
                padding: 16,
                marginBottom: 10,
                borderRadius: 6,
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {v.name} {v.branch && `(${v.branch})`}
              </div>

              <div style={{ fontSize: 13, marginTop: 4 }}>
                Revenue:{" "}
                {new Intl.NumberFormat("ru-RU").format(vesselRevenue)} ₽
              </div>

              <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
                Contracts: {vesselContracts.length}
              </div>
            </div>
          );
        })}
      </div>

      {syncing && <div style={{ marginTop: 20 }}>Saving...</div>}
    </div>
  );
}
