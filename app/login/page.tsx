"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Shield, Lock, Mail } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Đăng nhập thất bại");
        setLoading(false);
        return;
      }

      if (typeof window !== "undefined") {
        sessionStorage.setItem("justLoggedIn", "true");
        window.location.href = "/dashboard";
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: any) {
      setError("Lỗi kết nối máy chủ");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-6">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto shadow-lg shadow-blue-200">
          Q
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Đăng Nhập Hệ Thống</h2>
        <p className="text-sm text-gray-500">Quản lý công việc V1.2 &bull; Enterprise Task Engine</p>
      </div>

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
            Email
          </label>
          <div className="relative">
            <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nhanvien@example.com"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
            Mật Khẩu
          </label>
          <div className="relative">
            <Lock className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          <LogIn className="w-4 h-4" />
          {loading ? "Đang xử lý..." : "Đăng Nhập"}
        </button>
      </form>

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <div className="text-xs text-gray-500 text-center font-medium">Tài khoản thử nghiệm nhanh:</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setEmail("admin@example.com");
              setPassword("admin123");
            }}
            className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-semibold flex items-center justify-center gap-1 border border-blue-200"
          >
            <Shield className="w-3.5 h-3.5" /> Admin
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail("user1@example.com");
              setPassword("user123");
            }}
            className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-semibold flex items-center justify-center gap-1 border border-emerald-200"
          >
            <LogIn className="w-3.5 h-3.5" /> User 1
          </button>
        </div>
      </div>
    </div>
  );
}
