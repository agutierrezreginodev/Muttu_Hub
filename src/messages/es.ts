/**
 * Single source of truth for all user-facing copy (PRD S5).
 * UI components must never hardcode strings — import from here.
 * Later slices extend sections as their features land.
 */
export const es = {
  common: {
    appName: "Muttu Hub",
    loading: "Cargando…",
    save: "Guardar",
    saving: "Guardando…",
    cancel: "Cancelar",
    confirm: "Confirmar",
    delete: "Eliminar",
    edit: "Editar",
    close: "Cerrar",
    back: "Volver",
    genericError: "Ocurrió un error. Intentá de nuevo.",
    saveSuccess: "Cambios guardados.",
    deleteSuccess: "Eliminado correctamente.",
  },
  auth: {
    loginTitle: "Iniciar sesión",
    email: "Correo electrónico",
    password: "Contraseña",
    signIn: "Ingresar",
    signOut: "Cerrar sesión",
    invalidCredentials: "Credenciales inválidas.",
    recoveryTitle: "Recuperar contraseña",
    recoverySent: "Si el correo existe, te enviamos un enlace.",
    updatePasswordTitle: "Actualizar contraseña",
    passwordTooWeak: "Mínimo 8 caracteres, con letras y números.",
  },
  session: {
    idleSignedOut: "Sesión cerrada por inactividad.",
  },
  admin: {
    title: "Administración",
    users: "Usuarios",
    accessLog: "Registro de accesos",
  },
} as const;

export type Messages = typeof es;
