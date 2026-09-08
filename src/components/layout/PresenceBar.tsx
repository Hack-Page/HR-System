import React, { useEffect, useState, useRef } from 'react';
import { Users, Circle, ChevronDown, ExternalLink, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { presenceManager, ActiveUserPresence } from '../../services/presence-service';

export const PresenceBar: React.FC = () => {
  const { session } = useAuth();
  const [activeUsers, setActiveUsers] = useState<ActiveUserPresence[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    presenceManager.setSession(session);
  }, [session]);

  useEffect(() => {
    const unsubscribe = presenceManager.subscribe((users) => {
      setActiveUsers(users);
    });
    return unsubscribe;
  }, []);

  // Đóng popover khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!session) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition shadow-xs group"
        title="Danh sách nhân sự đang trực tuyến trong hệ thống"
      >
        {/* Avatars xếp chồng */}
        <div className="flex items-center -space-x-2">
          {activeUsers.slice(0, 3).map((user) => (
            <div
              key={user.username}
              className={`relative w-7 h-7 rounded-full bg-gradient-to-tr ${user.color || 'from-orange-400 to-amber-500'} text-white font-bold text-[11px] flex items-center justify-center ring-2 ring-white shadow-xs`}
            >
              {user.displayName.charAt(0).toUpperCase()}
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-1.5 ring-white" />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium pl-0.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="hidden md:inline text-[11px] font-semibold text-slate-600">
            {activeUsers.length} online
          </span>
          <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition" />
        </div>
      </button>

      {/* Popover chi tiết */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 z-50 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Users className="w-4 h-4 text-orange-500" />
              <span>Đang hoạt động ({activeUsers.length})</span>
            </div>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
              <Circle className="w-1.5 h-1.5 fill-emerald-500 text-emerald-500" />
              Realtime
            </span>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {activeUsers.map((user) => {
              const isMe = user.username.toLowerCase() === session.username.toLowerCase();
              return (
                <div
                  key={user.username}
                  className={`flex items-center justify-between p-2 rounded-xl transition ${
                    isMe ? 'bg-orange-50/60 border border-orange-100' : 'bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`relative w-8 h-8 rounded-full bg-gradient-to-tr ${user.color || 'from-slate-600 to-slate-800'} text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs`}
                    >
                      {user.displayName.charAt(0).toUpperCase()}
                      <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-1.5 ring-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {user.displayName}
                        </span>
                        {isMe && (
                          <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.2 rounded font-bold">
                            Bạn
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-semibold ${
                          user.role === 'AD System'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {user.role}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                      Trực tuyến
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[10px] text-slate-500 leading-relaxed bg-slate-50/80 p-2 rounded-xl">
            <p className="font-semibold text-slate-700 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              Đồng bộ Realtime Không Cần Server:
            </p>
            <p className="mt-0.5">
              Mở thêm 1 tab ẩn danh để đăng nhập tài khoản <b>Vinh</b> hoặc <b>Kiều</b> — avatar cả 2 sẽ lập tức hiển thị song song tại đây!
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
