"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import { useStaff } from "@/lib/useStaff";
import StaffGate from "@/components/StaffGate";

export default function AbsenPage() {
  const s = useStaff();
  return (
    <StaffGate s={s} title="Login Tablet Absen">
      <Absen outletId={s.outletId!} outletName={s.outlets.find((o) => o.id === s.outletId)?.name ?? ""} />
    </StaffGate>
  );
}

type Step = { kind: "pin" } | { kind: "selfie"; name: string; nextType: "in" | "out" } | { kind: "done"; name: string; type: "in" | "out"; at: string };

function Absen({ outletId, outletName }: { outletId: string; outletName: string }) {
  const [step, setStep] = useState<Step>({ kind: "pin" });
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Kembali ke layar PIN otomatis setelah selesai
  useEffect(() => {
    if (step.kind !== "done") return;
    const t = setTimeout(() => setStep({ kind: "pin" }), 5000);
    return () => clearTimeout(t);
  }, [step]);

  async function checkPin(p: string) {
    setBusy(true);
    setError("");
    const { data, error } = await supabase().rpc("attendance_check_pin", { p_outlet_id: outletId, p_pin: p });
    setBusy(false);
    if (error) {
      setError(errMsg(error));
      setPin("");
      return;
    }
    setStep({ kind: "selfie", name: data.name, nextType: data.next_type });
  }

  function press(d: string) {
    if (busy) return;
    const p = (pin + d).slice(0, 6);
    setPin(p);
    setError("");
  }

  async function submitSelfie(blob: Blob) {
    setBusy(true);
    setError("");
    const date = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const path = `${outletId}/${date}/${crypto.randomUUID()}.jpg`;
    const sb = supabase();
    const up = await sb.storage.from("absen").upload(path, blob, { contentType: "image/jpeg" });
    if (up.error) {
      setBusy(false);
      setError("Gagal upload foto: " + errMsg(up.error));
      return;
    }
    const { data, error } = await sb.rpc("clock_attendance", { p_outlet_id: outletId, p_pin: pin, p_photo_path: path });
    setBusy(false);
    setPin("");
    if (error) {
      setError(errMsg(error));
      setStep({ kind: "pin" });
      return;
    }
    setStep({ kind: "done", name: data.name, type: data.type, at: data.at });
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-kopi-900 p-6 text-white">
      <div className="flex w-full max-w-md items-center justify-between text-sm text-kopi-200">
        <span>{outletName}</span>
        <Link href="/kasir" className="underline">Ke kasir</Link>
      </div>
      <div className="mt-6 text-5xl font-bold tabular-nums">
        {now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" })}
      </div>
      <div className="text-kopi-200">{now.toLocaleDateString("id-ID", { dateStyle: "full", timeZone: "Asia/Jakarta" })}</div>

      {step.kind === "pin" && (
        <div className="mt-8 w-full max-w-xs">
          <p className="text-center">Masukkan PIN absen</p>
          <div className="my-4 flex justify-center gap-3">
            {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
              <span key={i} className={`h-4 w-4 rounded-full ${i < pin.length ? "bg-white" : "bg-white/20"}`} />
            ))}
          </div>
          {error && <p className="mb-3 rounded-lg bg-red-500/20 p-2 text-center text-sm">{error}</p>}
          <div className="grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} onClick={() => press(d)} className="h-16 rounded-2xl bg-white/10 text-2xl font-semibold active:bg-white/30">{d}</button>
            ))}
            <button onClick={() => setPin(pin.slice(0, -1))} className="h-16 rounded-2xl bg-white/5 text-lg">⌫</button>
            <button onClick={() => press("0")} className="h-16 rounded-2xl bg-white/10 text-2xl font-semibold active:bg-white/30">0</button>
            <button onClick={() => checkPin(pin)} disabled={pin.length < 4 || busy} className="h-16 rounded-2xl bg-kopi-500 font-semibold disabled:opacity-40">
              {busy ? "..." : "OK"}
            </button>
          </div>
        </div>
      )}

      {step.kind === "selfie" && (
        <Selfie
          name={step.name}
          nextType={step.nextType}
          busy={busy}
          error={error}
          onCapture={submitSelfie}
          onCancel={() => {
            setPin("");
            setStep({ kind: "pin" });
          }}
        />
      )}

      {step.kind === "done" && (
        <div className="mt-10 rounded-2xl bg-white p-8 text-center text-kopi-900">
          <div className="text-5xl">{step.type === "in" ? "👋" : "🏠"}</div>
          <p className="mt-3 text-2xl font-bold">{step.type === "in" ? "Selamat bekerja" : "Hati-hati di jalan"}, {step.name}!</p>
          <p className="mt-1 text-gray-600">
            Absen {step.type === "in" ? "masuk" : "pulang"} tercatat jam{" "}
            {new Date(step.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}
          </p>
        </div>
      )}
    </main>
  );
}

function Selfie({ name, nextType, busy, error, onCapture, onCancel }: {
  name: string; nextType: "in" | "out"; busy: boolean; error: string; onCapture: (b: Blob) => void; onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camError, setCamError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setCamError("Kamera tidak bisa dibuka. Izinkan akses kamera di browser."));
    if (!navigator.mediaDevices) setCamError("Browser ini tidak mendukung kamera (harus pakai HTTPS).");
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(v, 0, 0);
    // cap waktu di foto
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(0, c.height - 28, c.width, 28);
    ctx.fillStyle = "#fff";
    ctx.font = "16px sans-serif";
    ctx.fillText(`${name} · ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`, 8, c.height - 9);
    c.toBlob((b) => b && onCapture(b), "image/jpeg", 0.75);
  }

  return (
    <div className="mt-6 w-full max-w-sm text-center">
      <p className="text-lg">
        Halo <b>{name}</b>, absen <b>{nextType === "in" ? "MASUK" : "PULANG"}</b>
      </p>
      <div className="mt-3 overflow-hidden rounded-2xl bg-black">
        {camError ? (
          <p className="p-10 text-sm">{camError}</p>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full -scale-x-100 object-cover" />
        )}
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-500/20 p-2 text-sm">{error}</p>}
      <div className="mt-4 flex gap-3">
        <button onClick={onCancel} className="flex-1 rounded-xl bg-white/10 py-3">Batal</button>
        <button onClick={capture} disabled={busy || !!camError} className="flex-[2] rounded-xl bg-kopi-500 py-3 font-semibold disabled:opacity-40">
          {busy ? "Menyimpan..." : "📸 Ambil selfie"}
        </button>
      </div>
    </div>
  );
}
