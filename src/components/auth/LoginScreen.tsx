import React, { useState } from 'react';
import { Lock, User, LogIn, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth, DEFAULT_ADMIN_USERNAME } from '../../context/AuthContext';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const res = await login(username, password);
      if (!res.ok) setError(res.error || 'Đăng nhập thất bại');
    } catch (err: any) {
      setError(err?.message || 'Lỗi không xác định');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-orange-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 text-center border-b border-slate-100">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center mb-4 shadow-lg">
              <ShieldCheck className="w-8 h-8 text-orange-400" />
            </div>
            <h1 className="text-xl font-extrabold text-slate-900">SmartHR - Leggett &amp; Platt</h1>
            <p className="text-xs text-slate-500 mt-1">Hệ thống chấm công &amp; quản trị nhân sự</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">
            <div>
              <label htmlFor="login-username" className="block text-xs font-bold text-slate-600 mb-1.5">
                Tên đăng nhập
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ví dụ: admin"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400/60 focus:border-orange-400 transition"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-bold text-slate-600 mb-1.5">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400/60 focus:border-orange-400 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="px-3 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-sm font-bold rounded-xl transition shadow-md"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Đang kiểm tra...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 text-orange-400" />
                  <span>Đăng Nhập</span>
                </>
              )}
            </button>

            <div className="pt-2 text-center text-[11px] text-slate-400 leading-relaxed">
              Tài khoản lần đầu: <code className="font-mono font-bold text-slate-600">{DEFAULT_ADMIN_USERNAME} / admin123</code>
              <br />Vui lòng đổi mật khẩu ngay sau khi đăng nhập (mục Cài đặt).
            </div>
          </form>
        </div>

        <p className="text-center text-[10px] text-slate-400 mt-4">
          Xác thực cục bộ trên máy này (IndexedDB + SHA-256). Dữ liệu nhân sự không rời khỏi thiết bị.
        </p>
      </div>
    </div>
  );
};
