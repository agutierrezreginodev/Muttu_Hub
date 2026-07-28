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
    emailRequired: "Ingresá tu correo electrónico.",
    emailInvalid: "Ese correo electrónico no es válido.",
    passwordRequired: "Ingresá tu contraseña.",
    forgotPassword: "¿Olvidaste tu contraseña?",
    backToLogin: "Volver a iniciar sesión",
    recoveryTitle: "Recuperar contraseña",
    recoverySubmit: "Enviar enlace",
    recoverySent: "Si el correo existe, te enviamos un enlace.",
    updatePasswordTitle: "Actualizar contraseña",
    updatePasswordButton: "Actualizar contraseña",
    newPassword: "Nueva contraseña",
    confirmPassword: "Confirmar contraseña",
    passwordTooWeak: "Mínimo 8 caracteres, con letras y números.",
    passwordMismatch: "Las contraseñas no coinciden.",
  },
  session: {
    idleSignedOut: "Sesión cerrada por inactividad.",
  },
  home: {
    welcome: "Bienvenido a Muttu Hub.",
  },
  admin: {
    title: "Administración",
    users: "Usuarios",
    accessLog: "Registro de accesos",
  },
} as const;

export type Messages = typeof es;
