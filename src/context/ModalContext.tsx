import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, HelpCircle, X } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
}

interface ModalContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alertModal: (title: string, message: string | ReactNode, type?: 'danger' | 'warning' | 'info' | 'success') => Promise<void>;
  openCustomModal: (title: string, content: ReactNode, footer?: ReactNode) => void;
  closeCustomModal: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const [customModal, setCustomModal] = useState<{
    isOpen: boolean;
    title: string;
    content: ReactNode;
    footer?: ReactNode;
  } | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        options,
        resolve,
      });
    });
  }, []);

  const alertModal = useCallback((title: string, message: string | ReactNode, type: 'danger' | 'warning' | 'info' | 'success' = 'info'): Promise<void> => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        options: {
          title,
          message,
          type,
          confirmText: 'Đồng ý',
          cancelText: '',
        },
        resolve: () => resolve(),
      });
    });
  }, []);

  const handleConfirm = () => {
    if (confirmState) {
      confirmState.resolve(true);
      setConfirmState(null);
    }
  };

  const handleCancel = () => {
    if (confirmState) {
      confirmState.resolve(false);
      setConfirmState(null);
    }
  };

  const openCustomModal = (title: string, content: ReactNode, footer?: ReactNode) => {
    setCustomModal({ isOpen: true, title, content, footer });
  };

  const closeCustomModal = () => {
    setCustomModal(null);
  };

  return (
    <ModalContext.Provider value={{ confirm, alertModal, openCustomModal, closeCustomModal }}>
      {children}

      {/* Confirmation & Alert Modal Dialog */}
      {confirmState && confirmState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 transform transition-all animate-in zoom-in-95">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl shrink-0 bg-slate-100">
                {confirmState.options.type === 'danger' && <AlertCircle className="w-6 h-6 text-rose-600" />}
                {confirmState.options.type === 'warning' && <AlertTriangle className="w-6 h-6 text-amber-600" />}
                {confirmState.options.type === 'success' && <CheckCircle className="w-6 h-6 text-emerald-600" />}
                {(!confirmState.options.type || confirmState.options.type === 'info') && <HelpCircle className="w-6 h-6 text-blue-600" />}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900">{confirmState.options.title}</h3>
                <div className="text-sm text-slate-600 mt-2 leading-relaxed">
                  {confirmState.options.message}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              {confirmState.options.cancelText !== '' && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition"
                >
                  {confirmState.options.cancelText || 'Hủy bỏ'}
                </button>
              )}
              <button
                onClick={handleConfirm}
                className={`px-5 py-2 text-sm font-semibold rounded-xl text-white shadow-md transition ${
                  confirmState.options.type === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                    : confirmState.options.type === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'
                    : confirmState.options.type === 'success'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                }`}
              >
                {confirmState.options.confirmText || 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Modal */}
      {customModal && customModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 transform transition-all animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">{customModal.title}</h3>
              <button
                onClick={closeCustomModal}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              {customModal.content}
            </div>

            {customModal.footer && (
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                {customModal.footer}
              </div>
            )}
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
