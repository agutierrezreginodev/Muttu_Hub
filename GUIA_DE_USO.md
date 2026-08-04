# Guía de uso — Muttu Hub

**Para**: usuario nuevo del estudio
**Última actualización**: agosto 2026
**Soporte**: [tu email acá]

---

## 1. Cómo entrar por primera vez

### 1.1 Si te acaban de invitar

Vas a recibir un mail de **Muttu Hub** con el asunto "Has sido invitado
a Muttu Hub". Si no lo ves en tu bandeja de entrada, revisá spam y
promociones.

1. Abrí el mail
2. Hacé click en el botón **"Aceptar invitación"**
3. El navegador te lleva a la pantalla de login
4. Te va a pedir que crees tu contraseña. Tiene que tener:
   - Al menos 8 caracteres
   - Al menos una mayúscula
   - Al menos un número o símbolo
5. Después de crear la contraseña, ya quedás logueado

### 1.2 Si ya tenés cuenta

1. Abrí la app en el navegador (la URL te la pasa tu administrador)
2. Poné tu email y contraseña
3. Click en **"Ingresar"**

### 1.3 Si no podés entrar

| Problema                             | Solución                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| "Credenciales inválidas"             | Revisá que el email esté bien escrito. Las mayúsculas importan en la contraseña.           |
| "Correo no registrado"               | Pedile a tu administrador que te invite.                                                   |
| Link de invitación expirado          | Pedile al administrador que te mande una invitación nueva.                                 |
| Te desloguea solo después de un rato | Es por seguridad: si no tocás nada por 8 horas, la sesión se cierra sola. Vuelve a entrar. |

---

## 2. La pantalla principal — qué hay dónde

Cuando entrás, la pantalla se divide en tres partes:

```
┌─────────────────────────────────────────────────┐
│ [Muttu Hub]                          [Tu nombre]│  ← barra superior
├──────────┬──────────────────────────────────────┤
│          │                                      │
│ Clientes │                                      │
│ Kanban   │       Contenido de la sección        │
│ Admin    │                                      │
│          │                                      │
└──────────┴──────────────────────────────────────┘
   ↑ Menú lateral          ↑ Lo que estás viendo
```

**El menú lateral** tiene los módulos a los que vos podés acceder. Si
no ves un módulo es porque tu rol no tiene permiso.

**La barra superior** tiene tu nombre — si hacés click ahí ves la
opción de cerrar sesión.

---

## 3. Módulo CRM — Gestión de clientes

### 3.1 Ver la lista de clientes

**Menú lateral → Clientes**

Vas a ver una tabla con todos los clientes del estudio. Las columnas
son:

- **Cliente**: el nombre comercial
- **Responsable**: quién del estudio lo atiende
- **Estado**: nuevo / activo / inactivo
- **Acciones**: botón para abrir la ficha

**Truco**: en el buscador de arriba de la tabla podés escribir el
nombre del cliente y la lista se filtra al toque.

### 3.2 Crear un cliente nuevo

1. Click en el botón **"+ Nuevo cliente"** arriba a la derecha
2. Completá los campos obligatorios (marcados con asterisco rojo)
3. Opcionalmente completá email, teléfono, dirección
4. Click en **"Guardar"**

El cliente aparece en la lista y ya podés abrirlo.

### 3.3 Abrir la ficha de un cliente

Click en cualquier fila de la lista. Se abre la ficha con seis
pestañas:

#### Pestaña "Información"

Datos básicos del cliente: nombre, CUIT/RFC, dirección, responsable
asignado, observaciones. Para editar, click en el lápiz arriba a la
derecha.

#### Pestaña "Contactos"

Las personas con las que hablás en el cliente. Cada contacto tiene
nombre, cargo, email y teléfono. Para agregar uno nuevo, click en
**"+ Nuevo contacto"**.

#### Pestaña "Oportunidades"

Los negocios en curso. Cada oportunidad tiene:

- **Nombre** (ej: "Implementación sistema X")
- **Etapa** (Nueva, Calificada, Propuesta, Ganada, Perdida)
- **Valor estimado** (en pesos/dólares, configurable)
- **Fecha estimada de cierre**
- **Responsable**

Para cambiar la etapa de una oportunidad, abrila y usá el selector de
etapa. El cambio queda registrado en la bitácora.

#### Pestaña "Bitácora"

Registro cronológico de TODO lo que pasa con el cliente: llamadas,
reuniones, mails, notas, recordatorios. Es lo primero que tenés que
mirar si querés saber "¿qué pasó con este cliente?".

Cada entrada tiene:

- Fecha y hora
- Quién la escribió
- Tipo (llamada, reunión, mail, nota, otro)
- Descripción

Para agregar una entrada nueva, click en **"+ Nueva entrada"**.
Tip: si estás en una llamada, anotalo apenas cortés. Después te
olvidás.

#### Pestaña "Compromisos"

Lo que el estudio se COMPROMETIÓ a hacer para el cliente. Cada
compromiso tiene título, descripción, fecha de vencimiento, y estado
(pendiente / cumplido / vencido).

#### Pestaña "Tareas"

Lo que vos o tu equipo están HACIENDO para cumplir los compromisos.
Cada tarea tiene título, responsable, fecha límite, prioridad, y
estado.

### 3.4 Volver a la lista

Click en **"Clientes"** en el menú lateral, o en la flecha de "Volver"
arriba a la izquierda.

---

## 4. Módulo Documentos

### 4.1 Ver los documentos de un cliente

1. Abrí la ficha del cliente
2. Click en la pestaña **"Documentos"**
3. Vas a ver la tabla con todos los documentos asociados

### 4.2 Subir un documento nuevo

1. Click en **"Subir documento"** arriba a la derecha
2. Completá:
   - **Nombre**: cómo se va a llamar el documento
   - **Categoría**: elegí de la lista (Contrato, Onboarding, etc.)
   - **Descripción**: opcional, qué es el documento
   - **Etiquetas**: opcional, separadas por coma
3. Click en **"Elegir archivo"** y seleccioná el archivo de tu
   computadora
4. Click en **"Subir"**

Cuando termina, ves un mensaje verde de confirmación y el documento
aparece en la tabla.

### 4.3 Bajar un documento

Click en el ícono de descarga a la derecha del documento en la tabla.
El archivo se baja a tu carpeta de descargas normal.

### 4.4 Subir una nueva versión de un documento existente

Si el documento se actualizó y querés mantener la versión anterior:

1. Click en el documento en la tabla
2. Click en **"Subir nueva versión"**
3. Seleccioná el archivo actualizado
4. Click en **"Subir"**

La versión anterior queda guardada y accesible desde **"Ver
historial de versiones"**.

### 4.5 Bajar varios documentos juntos (ZIP)

1. Tildá las casillas de la izquierda de los documentos que querés
2. Click en **"Descargar seleccionados (.zip)"** arriba de la tabla
3. Esperá unos segundos (puede tardar si son muchos archivos o muy
   pesados)
4. El ZIP se baja a tu carpeta de descargas

### 4.6 Editar o borrar un documento

Solo disponible para Coordinador o Administrador:

- **Editar**: click en el ícono de lápiz. Cambiá el nombre,
  descripción, etiquetas, o categoría.
- **Borrar**: click en el ícono de tacho. Te pide confirmación.
  **Cuidado: borrar un documento no borra los archivos ya subidos,
  pero los oculta del sistema. Si te equivocaste, contactá a tu
  administrador.**

### 4.7 Permisos sobre documentos

**Esta es la parte importante**: no todos los usuarios pueden ver
todos los documentos. El acceso se controla por categoría.

- Un **Colaborador** solo ve documentos en categorías que le fueron
  otorgadas explícitamente
- Un **Coordinador** ve las suyas más las categorías de su equipo
- Un **Gerente** ve casi todas
- Un **Administrador** ve todas

Si intentás acceder a un documento sin permiso, ves el error
**"No tenés acceso a esa categoría"**. Hablá con tu administrador si
necesitás que te otorguen acceso a alguna categoría.

---

## 5. Módulo Kanban — Tablero de tareas

### 5.1 Para qué sirve

Es la vista de TODO lo que está pendiente en el estudio. Cada tarjeta
es una tarea concreta que alguien tiene que hacer.

### 5.2 Las columnas

- **Pendiente**: la tarea existe pero nadie la empezó
- **En curso**: alguien la está haciendo ahora
- **En revisión**: terminada, esperando que alguien la valide
- **Hecho**: terminada y validada

### 5.3 Ver una tarea

Click en la tarjeta. Ves:

- Título
- Descripción
- Responsable (quién la está haciendo)
- Fecha límite
- Prioridad
- Etiquetas
- Cliente asociado (si la tarea está atada a un cliente)

### 5.4 Mover una tarea entre columnas

> **Nota**: en la versión actual el tablero es de SOLO LECTURA. Para
> mover tareas hay que pedírselo al administrador. La función de
> drag&drop se está terminando y entra en la próxima actualización.

### 5.5 Permisos del Kanban

- Solo ves las tarjetas que tenés asignadas o las de tu equipo
- No podés ver tarjetas de categorías a las que no tenés acceso
- Los permisos por columna también se pueden configurar (pedile a
  tu administrador si necesitás un ajuste)

---

## 6. Módulo Administración

**Solo visible para usuarios con rol Administrador o Gerencia.**

### 6.1 Usuarios

Acá ves todos los usuarios del estudio. Para cada uno: nombre, email,
rol, estado (activo/inactivo).

**Invitar un usuario nuevo**:

1. Click en **"+ Invitar usuario"**
2. Poné el email y el nombre
3. Asigná un rol
4. Click en **"Enviar invitación"**
5. El usuario recibe un mail con el link para crear su contraseña

**Cambiar el rol de un usuario existente**:

1. Click en el usuario en la tabla
2. Cambiá el selector de rol
3. Click en "Guardar"

**Desactivar un usuario**:

1. Click en el usuario
2. Click en "Desactivar"
3. Confirmá

El usuario desactivado no puede entrar más, pero su histórico de
trabajo queda guardado.

### 6.2 Roles

Los cuatro roles del sistema:

| Rol           | Qué puede hacer                                            |
| ------------- | ---------------------------------------------------------- |
| Administrador | Todo en todos los módulos                                  |
| Gerencia      | Ver y exportar en todo. No puede borrar. No entra a Admin. |
| Coordinador   | Ver, crear y editar en CRM/Kanban/Documentos. No borrar.   |
| Colaborador   | Ver y crear. Solo edita lo que tiene asignado.             |

La matriz detallada se puede revisar y modificar desde esta sección.
**Cuidado**: cambiar permisos afecta a todos los usuarios con ese
rol.

### 6.3 Catálogos

Las listas de valores que se usan en toda la app:

- Tipos de servicio
- Estados de oportunidad
- Etiquetas
- Categorías de documento
- Tipos de entrada de bitácora

Para agregar un valor nuevo, click en **"+ Nuevo"** en el catálogo
correspondiente. Para desactivarlo (no eliminarlo, porque puede estar
usado en registros históricos), usá el botón "Desactivar".

### 6.4 Permisos por categoría de documento

Acá es donde se otorga a cada usuario o rol el acceso a categorías
específicas de documentos. Por ejemplo: "Los usuarios con rol
Coordinador pueden ver la categoría Contratos".

1. Seleccioná la categoría en el dropdown
2. Tildá los usuarios o roles que deban acceder
3. Click en "Guardar"

---

## 7. Sesión y seguridad

### 7.1 Cierre de sesión manual

Click en tu nombre arriba a la derecha → **"Cerrar sesión"**.

### 7.2 Cierre automático por inactividad

Si no tocás nada durante 8 horas, la sesión se cierra sola. Es por
seguridad — si dejás la compu abierta y te vas, nadie puede entrar a
tu cuenta.

### 7.3 Cambiar tu contraseña

Por ahora el cambio de contraseña se hace desde el mail de
"recuperar contraseña" en la pantalla de login. La función de
cambio desde el perfil está en el roadmap.

### 7.4 Qué hacer si perdés el celular o te roban la compu

Avisale **inmediatamente** a tu administrador para que desactive
tu cuenta. Después podés recuperarla reactivándola y cambiando la
contraseña.

---

## 8. Problemas frecuentes

### "No puedo ver un cliente que sé que existe"

Probablemente es un tema de permisos. Contactá a tu administrador
para que te otorgue acceso.

### "Subí un documento pero no aparece"

- Esperá 5 segundos y refrescá la página (F5)
- Si sigue sin aparecer, fijate si la categoría es la correcta
- Si tenés permisos sobre la categoría, contactá al administrador

### "Me desloguea todo el tiempo"

- Revisá que no estés en modo incógnito (algunos navegadores
  borran la sesión al cerrar)
- Revisá que no tengas extensiones que limpien cookies

### "Un cliente dice que le mandamos algo que yo no encuentro"

- Buscá en la Bitácora del cliente (todas las comunicaciones
  quedan registradas)
- Si no está, fijate en el mail — tal vez se mandó desde otro
  canal

### "El Kanban no me deja mover tarjetas"

Es correcto, en la versión actual el tablero es de solo lectura.
La función de drag&drop entra en la próxima actualización.

---

## 9. Glosario

- **CRM**: módulo de gestión de clientes
- **Bitácora**: registro cronológico de actividades
- **Compromiso**: lo que prometiste hacer al cliente
- **Tarea**: lo que estás haciendo para cumplir un compromiso
- **Oportunidad**: negocio en curso con un valor estimado
- **Categoría de documento**: agrupación lógica (Contratos,
  Onboarding, etc.)
- **Catálogo**: lista de valores configurables (tipos, estados,
  etiquetas)
- **Rol**: conjunto de permisos que se asigna a un usuario
- **RLS (Row Level Security)**: sistema de Supabase que hace que
  cada usuario SOLO vea los datos que le corresponden, sin importar
  qué pantalla abra

---

## 10. Contacto y soporte

- **Mail**: [tu email]
- **Teléfono**: [tu teléfono]
- **Horario de atención**: [horario]
- **Para urgencias fuera de horario**: [procedimiento]

---

**Versión de la app**: Muttu Hub v0.1 (agosto 2026)
**Versión de esta guía**: 1.0
