import React, { useState, useEffect, useCallback } from 'react';
import { PageShell } from '../../core/components/layout/PageShell';
import api from '../../core/services/apiClient';
import {
  Users, Building2, FileText, Calendar, Plus, Pencil, Trash2,
  Loader2, Search, X, ChevronDown, Check, UserCheck, UserX, Clock,
} from 'lucide-react';
import type { Toast } from '../../core/components/ui/Toast';

interface Props { showToast?: (msg: string, type: Toast['type']) => void; }

type Employee = {
  id: number; full_name: string; job_title: string; department_name: string;
  department_id: number; hire_date: string; contract_type: string;
  salary: number; phone: string; email: string; status: string; avatar_url: string;
};
type Department = { id: number; name: string; description: string; manager_name: string; employee_count: number; };
type Leave = {
  id: number; employee_name: string; type: string; start_date: string;
  end_date: string; days: number; reason: string; status: string;
};
type Stats = { total: number; active: number; on_leave: number; departments: number; pending_leaves: number; };

const TAB = { EMPLOYEES: 'employees', DEPARTMENTS: 'departments', LEAVES: 'leaves' } as const;
type Tab = typeof TAB[keyof typeof TAB];

const CONTRACT_LABELS: Record<string, string> = {
  full_time: 'Tempo Inteiro', part_time: 'Meio Período',
  intern: 'Estagiário', contractor: 'Prestador',
};
const LEAVE_TYPES: Record<string, string> = {
  annual: 'Férias', sick: 'Doença', maternity: 'Maternidade', unpaid: 'Sem Vencimento', other: 'Outro',
};
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  on_leave: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-surface-base text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500';
const labelCls = 'block text-xs font-medium text-content-secondary mb-1';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay p-4">
      <div className="bg-surface-raised rounded-2xl shadow-xl w-full max-w-lg animate-modal-enter">
        <div className="flex items-center justify-between p-5 border-b border-border-default">
          <h3 className="font-semibold text-content-primary">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-overlay text-content-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function HR({ showToast }: Props) {
  const [tab, setTab] = useState<Tab>(TAB.EMPLOYEES);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<'employee' | 'department' | 'leave' | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [empForm, setEmpForm] = useState({ full_name: '', job_title: '', department_id: '', hire_date: '', contract_type: 'full_time', salary: '', phone: '', email: '', status: 'active', notes: '' });
  const [deptForm, setDeptForm] = useState({ name: '', description: '' });
  const [leaveForm, setLeaveForm] = useState({ employee_id: '', type: 'annual', start_date: '', end_date: '', days: '1', reason: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, d, l, s] = await Promise.all([
        api.get<Employee[]>('/hr/employees'),
        api.get<Department[]>('/hr/departments'),
        api.get<Leave[]>('/hr/leaves'),
        api.get<Stats>('/hr/stats'),
      ]);
      setEmployees(e); setDepartments(d); setLeaves(l); setStats(s);
    } catch { showToast?.('Erro ao carregar dados', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (type: 'employee' | 'department' | 'leave', item: any) => {
    setEditing(item);
    if (type === 'employee') setEmpForm({ full_name: item.full_name, job_title: item.job_title||'', department_id: item.department_id||'', hire_date: item.hire_date?.slice(0,10)||'', contract_type: item.contract_type||'full_time', salary: item.salary||'', phone: item.phone||'', email: item.email||'', status: item.status||'active', notes: item.notes||'' });
    if (type === 'department') setDeptForm({ name: item.name, description: item.description||'' });
    setModal(type);
  };

  const saveEmployee = async () => {
    setSaving(true);
    try {
      if (editing) await api.put(`/hr/employees/${editing.id}`, empForm);
      else await api.post('/hr/employees', empForm);
      showToast?.('Guardado', 'success'); setModal(null); setEditing(null); load();
    } catch (e: any) { showToast?.(e.message || 'Erro', 'error'); }
    finally { setSaving(false); }
  };

  const saveDept = async () => {
    setSaving(true);
    try {
      if (editing) await api.put(`/hr/departments/${editing.id}`, deptForm);
      else await api.post('/hr/departments', deptForm);
      showToast?.('Guardado', 'success'); setModal(null); setEditing(null); load();
    } catch (e: any) { showToast?.(e.message || 'Erro', 'error'); }
    finally { setSaving(false); }
  };

  const saveLeave = async () => {
    setSaving(true);
    try {
      await api.post('/hr/leaves', leaveForm);
      showToast?.('Pedido enviado', 'success'); setModal(null); load();
    } catch (e: any) { showToast?.(e.message || 'Erro', 'error'); }
    finally { setSaving(false); }
  };

  const updateLeaveStatus = async (id: number, status: string) => {
    try {
      await api.put(`/hr/leaves/${id}/status`, { status });
      showToast?.(status === 'approved' ? 'Aprovado' : 'Rejeitado', 'success'); load();
    } catch { showToast?.('Erro', 'error'); }
  };

  const deleteEmployee = async (id: number) => {
    if (!confirm('Eliminar funcionário?')) return;
    try { await api.delete(`/hr/employees/${id}`); showToast?.('Eliminado', 'success'); load(); }
    catch { showToast?.('Erro', 'error'); }
  };

  const filteredEmployees = employees.filter(e =>
    !q || e.full_name.toLowerCase().includes(q.toLowerCase()) ||
    (e.email||'').toLowerCase().includes(q.toLowerCase())
  );

  const tabs = [
    { id: TAB.EMPLOYEES, label: 'Funcionários', icon: Users },
    { id: TAB.DEPARTMENTS, label: 'Departamentos', icon: Building2 },
    { id: TAB.LEAVES, label: 'Ausências', icon: Calendar },
  ];

  return (
    <PageShell title="Recursos Humanos" description="Gestão de funcionários, departamentos e ausências"
      actions={
        <button onClick={() => { setEditing(null); setEmpForm({ full_name:'', job_title:'', department_id:'', hire_date:'', contract_type:'full_time', salary:'', phone:'', email:'', status:'active', notes:'' }); setModal(tab === TAB.DEPARTMENTS ? 'department' : tab === TAB.LEAVES ? 'leave' : 'employee'); }}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />
          {tab === TAB.DEPARTMENTS ? 'Novo Departamento' : tab === TAB.LEAVES ? 'Pedir Ausência' : 'Novo Funcionário'}
        </button>
      }>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total', value: stats.total, icon: Users, color: 'text-blue-600' },
            { label: 'Activos', value: stats.active, icon: UserCheck, color: 'text-green-600' },
            { label: 'Ausentes', value: stats.on_leave, icon: UserX, color: 'text-yellow-600' },
            { label: 'Departamentos', value: stats.departments, icon: Building2, color: 'text-purple-600' },
            { label: 'Pedidos Pendentes', value: stats.pending_leaves, icon: Clock, color: 'text-orange-600' },
          ].map(s => (
            <div key={s.label} className="bg-surface-raised rounded-xl border border-border-default p-4 flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.color} shrink-0`} />
              <div>
                <p className="text-xl font-bold text-content-primary">{s.value}</p>
                <p className="text-xs text-content-muted">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-surface-raised rounded-2xl border border-border-default overflow-hidden">
        <div className="flex border-b border-border-default overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400' : 'border-transparent text-content-muted hover:text-content-primary'}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-content-muted" /></div>
          ) : tab === TAB.EMPLOYEES ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar funcionário…"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-border-default rounded-lg bg-surface-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border-default">
                    {['Nome', 'Cargo', 'Departamento', 'Tipo', 'Salário', 'Estado', ''].map(h => (
                      <th key={h} className="text-left py-3 px-3 text-xs font-medium text-content-muted">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filteredEmployees.map(emp => (
                      <tr key={emp.id} className="border-b border-border-default/50 hover:bg-surface-overlay/50">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 text-xs font-bold shrink-0">
                              {emp.full_name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-content-primary">{emp.full_name}</p>
                              <p className="text-xs text-content-muted">{emp.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-content-secondary">{emp.job_title || '—'}</td>
                        <td className="py-3 px-3 text-content-secondary">{emp.department_name || '—'}</td>
                        <td className="py-3 px-3 text-content-secondary">{CONTRACT_LABELS[emp.contract_type] || emp.contract_type}</td>
                        <td className="py-3 px-3 text-content-secondary">MT {Number(emp.salary||0).toFixed(2)}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[emp.status]}`}>
                            {emp.status === 'active' ? 'Activo' : emp.status === 'on_leave' ? 'Ausente' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openEdit('employee', emp)} className="p-1.5 rounded-lg hover:bg-surface-overlay text-content-muted hover:text-content-primary"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => deleteEmployee(emp.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-content-muted hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredEmployees.length === 0 && (
                      <tr><td colSpan={7} className="py-12 text-center text-content-muted">Nenhum funcionário encontrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : tab === TAB.DEPARTMENTS ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {departments.map(d => (
                <div key={d.id} className="border border-border-default rounded-xl p-4 hover:bg-surface-overlay/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-content-primary">{d.name}</p>
                      {d.description && <p className="text-xs text-content-muted mt-0.5">{d.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit('department', d)} className="p-1.5 rounded-lg hover:bg-surface-overlay text-content-muted"><Pencil className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border-default flex items-center gap-4 text-xs text-content-muted">
                    <span><span className="font-medium text-content-primary">{d.employee_count}</span> funcionários</span>
                    {d.manager_name && <span>Gestor: <span className="text-content-secondary">{d.manager_name}</span></span>}
                  </div>
                </div>
              ))}
              {departments.length === 0 && (
                <p className="col-span-3 text-center py-12 text-content-muted">Nenhum departamento criado</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {leaves.map(l => (
                <div key={l.id} className="flex items-center gap-4 border border-border-default rounded-xl p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-content-primary">{l.employee_name}</span>
                      <span className="text-xs bg-surface-overlay px-2 py-0.5 rounded-full text-content-secondary">{LEAVE_TYPES[l.type]||l.type}</span>
                    </div>
                    <p className="text-xs text-content-muted mt-0.5">{l.start_date?.slice(0,10)} → {l.end_date?.slice(0,10)} ({l.days} dias)</p>
                    {l.reason && <p className="text-xs text-content-secondary mt-1 truncate">{l.reason}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[l.status]}`}>
                      {l.status === 'pending' ? 'Pendente' : l.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                    </span>
                    {l.status === 'pending' && (
                      <>
                        <button onClick={() => updateLeaveStatus(l.id, 'approved')} className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 hover:bg-green-100"><Check className="w-4 h-4" /></button>
                        <button onClick={() => updateLeaveStatus(l.id, 'rejected')} className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100"><X className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {leaves.length === 0 && <p className="text-center py-12 text-content-muted">Nenhum pedido de ausência</p>}
            </div>
          )}
        </div>
      </div>

      {/* Modal Funcionário */}
      {modal === 'employee' && (
        <Modal title={editing ? 'Editar Funcionário' : 'Novo Funcionário'} onClose={() => { setModal(null); setEditing(null); }}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Nome Completo *</label>
                <input value={empForm.full_name} onChange={e => setEmpForm(p=>({...p,full_name:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cargo</label>
                <input value={empForm.job_title} onChange={e => setEmpForm(p=>({...p,job_title:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Departamento</label>
                <select value={empForm.department_id} onChange={e => setEmpForm(p=>({...p,department_id:e.target.value}))} className={inputCls}>
                  <option value="">Nenhum</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Data de Admissão</label>
                <input type="date" value={empForm.hire_date} onChange={e => setEmpForm(p=>({...p,hire_date:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tipo de Contrato</label>
                <select value={empForm.contract_type} onChange={e => setEmpForm(p=>({...p,contract_type:e.target.value}))} className={inputCls}>
                  {Object.entries(CONTRACT_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Salário (MT)</label>
                <input type="number" value={empForm.salary} onChange={e => setEmpForm(p=>({...p,salary:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Estado</label>
                <select value={empForm.status} onChange={e => setEmpForm(p=>({...p,status:e.target.value}))} className={inputCls}>
                  <option value="active">Activo</option>
                  <option value="on_leave">Ausente</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Telefone</label>
                <input value={empForm.phone} onChange={e => setEmpForm(p=>({...p,phone:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={empForm.email} onChange={e => setEmpForm(p=>({...p,email:e.target.value}))} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Notas</label>
              <textarea value={empForm.notes} onChange={e => setEmpForm(p=>({...p,notes:e.target.value}))} rows={2} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setModal(null); setEditing(null); }} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={saveEmployee} disabled={saving || !empForm.full_name}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Departamento */}
      {modal === 'department' && (
        <Modal title={editing ? 'Editar Departamento' : 'Novo Departamento'} onClose={() => { setModal(null); setEditing(null); }}>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Nome *</label>
              <input value={deptForm.name} onChange={e => setDeptForm(p=>({...p,name:e.target.value}))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Descrição</label>
              <textarea value={deptForm.description} onChange={e => setDeptForm(p=>({...p,description:e.target.value}))} rows={3} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setModal(null); setEditing(null); }} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={saveDept} disabled={saving || !deptForm.name}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Ausência */}
      {modal === 'leave' && (
        <Modal title="Pedir Ausência" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Funcionário *</label>
              <select value={leaveForm.employee_id} onChange={e => setLeaveForm(p=>({...p,employee_id:e.target.value}))} className={inputCls}>
                <option value="">Seleccionar…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Tipo</label>
                <select value={leaveForm.type} onChange={e => setLeaveForm(p=>({...p,type:e.target.value}))} className={inputCls}>
                  {Object.entries(LEAVE_TYPES).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Dias</label>
                <input type="number" min="1" value={leaveForm.days} onChange={e => setLeaveForm(p=>({...p,days:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Data Início</label>
                <input type="date" value={leaveForm.start_date} onChange={e => setLeaveForm(p=>({...p,start_date:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Data Fim</label>
                <input type="date" value={leaveForm.end_date} onChange={e => setLeaveForm(p=>({...p,end_date:e.target.value}))} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Motivo</label>
              <textarea value={leaveForm.reason} onChange={e => setLeaveForm(p=>({...p,reason:e.target.value}))} rows={2} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={saveLeave} disabled={saving || !leaveForm.employee_id || !leaveForm.start_date}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Enviar Pedido
              </button>
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}

export default HR;
