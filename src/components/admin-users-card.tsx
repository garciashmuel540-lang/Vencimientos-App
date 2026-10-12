/**
 * Card de gestión de usuarios (solo admin).
 * Se muestra en Ajustes.
 */
import { useEffect, useState } from "react";
import { Plus, Trash2, UserPlus, Shield, User as UserIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAdminUsers,
  createAdminUser,
  deleteAdminUser,
  setAdminUserRole,
  type AdminUser,
} from "@/lib/data/admin-users-supabase";
import { useSupabaseAuth } from "@/lib/auth/supabase-auth";

export function AdminUsersCard() {
  const { user: currentUser } = useSupabaseAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "employee">("employee");
  const [submitting, setSubmitting] = useState(false);

  async function loadUsers() {
    setLoading(true);
    try {
      const list = await listAdminUsers();
      setUsers(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`No se pudieron cargar usuarios: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  function resetForm() {
    setNewEmail("");
    setNewPassword("");
    setNewRole("employee");
  }

  async function handleCreate() {
    if (!newEmail.trim() || !newPassword.trim()) {
      toast.error("Email y contraseña son obligatorios.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      await createAdminUser({
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        role: newRole,
      });
      toast.success(`✅ Usuario creado: ${newEmail}`);
      resetForm();
      setCreating(false);
      await loadUsers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`Error al crear: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteAdminUser(pendingDelete.id);
      toast.success(`Usuario borrado: ${pendingDelete.email}`);
      setPendingDelete(null);
      await loadUsers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`Error al borrar: ${msg}`);
    }
  }

  async function handleRoleChange(user: AdminUser, role: "admin" | "employee") {
    try {
      await setAdminUserRole(user.id, role);
      toast.success(`Rol actualizado: ${user.email}`);
      await loadUsers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`Error al cambiar rol: ${msg}`);
    }
  }

  return (
    <>
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserPlus className="size-4 text-muted-foreground" />
            <h2 className="font-medium">Gestión de usuarios</h2>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() => setCreating(true)}
          >
            <Plus className="size-4" /> Agregar
          </Button>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Crea, edita o borra usuarios de la app. Solo administradores.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Cargando usuarios...
            </div>
          ) : users.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No hay usuarios.
            </p>
          ) : (
            users.map((u) => {
              const isMe = u.id === currentUser?.id;
              return (
                <div
                  key={u.id}
                  className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {u.email ?? "sin email"}
                      {isMe && (
                        <span className="ml-2 text-[10px] uppercase text-primary">
                          (tú)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {u.role === "admin" ? "Administrador" : "Empleado"}
                    </p>
                  </div>

                  <Select
                    value={u.role}
                    onValueChange={(v) =>
                      void handleRoleChange(u, v as "admin" | "employee")
                    }
                    disabled={isMe}
                  >
                    <SelectTrigger
                      className="h-8 w-[110px] rounded-lg text-xs"
                      aria-label="Rol"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <span className="inline-flex items-center gap-1">
                          <Shield className="size-3" /> Admin
                        </span>
                      </SelectItem>
                      <SelectItem value="employee">
                        <span className="inline-flex items-center gap-1">
                          <UserIcon className="size-3" /> Empleado
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setPendingDelete(u)}
                    disabled={isMe}
                    aria-label="Borrar usuario"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
            <DialogDescription>
              Crea una cuenta para un empleado o admin.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="empleado@tienda.com"
                className="mt-1"
                autoCapitalize="none"
              />
            </div>
            <div>
              <Label htmlFor="new-password">Contraseña</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Rol</Label>
              <Select
                value={newRole}
                onValueChange={(v) => setNewRole(v as "admin" | "employee")}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">
                    <span className="inline-flex items-center gap-1">
                      <UserIcon className="size-3" /> Empleado
                    </span>
                  </SelectItem>
                  <SelectItem value="admin">
                    <span className="inline-flex items-center gap-1">
                      <Shield className="size-3" /> Admin
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setCreating(false);
              }}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button onClick={() => void handleCreate()} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Creando...
                </>
              ) : (
                "Crear usuario"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará <strong>{pendingDelete?.email}</strong> y todos sus datos
              (inventario, conteos FS). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              Sí, borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
