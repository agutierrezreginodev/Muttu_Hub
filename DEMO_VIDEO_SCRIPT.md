# Demo Video — Muttu Hub

**Duración objetivo**: 6–8 minutos
**Idioma**: Español (Rioplatense neutro, igual al de la app)
**Audiencia**: Cliente que aún no conoce el producto
**Objetivo**: Que el cliente entienda QUÉ hace la app, no CÓMO está construida

---

## Antes de grabar

- Haber corrido `DEMO_CHECKLIST.md` completo
- Tener los 3 clientes / contactos / oportunidades / documentos / tareas
  kanban ya cargados (no perder tiempo en la grabación)
- Tener abierto Mailpit en otra ventana por si te preguntan cómo se invita
  un usuario
- Tener `pnpm dev` corriendo y logueado como admin

---

## 0. Apertura (0:00 – 0:30)

**[Mostrar pantalla de login con la app ya cargada en background]**

> "Hola. Te voy a mostrar Muttu Hub, la plataforma que armamos para
> centralizar la operación del estudio. Muttu Hub tiene tres módulos
> principales hoy: gestión de clientes (lo que llamamos CRM), un
> repositorio de documentos con control de acceso, y un tablero Kanban
> para coordinar el trabajo del equipo.
>
> Todo está protegido con login y roles — cada persona del equipo ve
> solamente lo que le corresponde. Te lo muestro entrando como
> Administrador para que veas la vista completa."

**[Loguearte. La pantalla home te lleva directo al módulo CRM.]**

---

## 1. CRM — Gestión de clientes (0:30 – 2:30)

**[Estás en la lista de clientes]**

> "Acá estoy en el módulo CRM. Esta es la lista de clientes. Cada fila es
> un cliente del estudio con su responsable asignado y un indicador del
> estado de la relación."

**[Click en un cliente — se abre la ficha]**

> "Cuando entro a un cliente se abre la ficha con toda la información.
> Fijate que tiene varias pestañas: Contactos, Oportunidades, Bitácora,
> Compromisos, Tareas, y Documentos. Cada pestaña es un módulo."

**[Click en la pestaña Contactos]**

> "Contactos son las personas asociadas al cliente. Acá puedo ver nombre,
> cargo, email y teléfono. Para agregar uno nuevo, click en 'Nuevo
> contacto'."

**[Mostrar el diálogo de nuevo contacto — NO guardar, cancelar]**

**[Click en la pestaña Oportunidades]**

> "Oportunidades son los negocios en curso. Cada oportunidad tiene un
> estado — nueva, en curso, ganada, perdida — y un valor estimado. Esto
> es lo que alimenta después el dashboard de pipeline."

**[Click en Bitácora]**

> "La bitácora es un registro cronológico de todo lo que pasa con el
> cliente: llamadas, reuniones, notas, recordatorios. Es el historial
> completo. Cada entrada tiene fecha, autor, y un tipo — y se puede
> exportar a PDF si el cliente lo pide."

**[Click en Compromisos → Tareas]**

> "Compromisos son las cosas que el estudio se comprometió a hacer para
> este cliente. Tareas son las cosas que ya estamos haciendo para
> cumplirlos. Si el cliente te pregunta 'qué me deben', vas a
> Compromisos. Si te pregunta 'en qué están', vas a Tareas."

---

## 2. Documentos (2:30 – 4:00)

**[Click en la pestaña Documentos del cliente]**

> "Acá está el repositorio de documentos del cliente. Cada documento
> tiene un nombre, una categoría, una descripción, etiquetas, y un
> historial de versiones. Esto es clave: cada vez que alguien sube una
> versión nueva del mismo documento, no se pierde la anterior. Siempre
> podés volver atrás."

**[Mostrar la tabla con 2-3 documentos]**

> "Lo importante: el acceso a los documentos está controlado por
> categoría. No todos los usuarios del estudio pueden ver todas las
> categorías. Por ejemplo, un Colaborador puede ver documentos
> generales del cliente, pero no los contratos firmados — eso requiere
> el rol Coordinador o superior."

**[Click en una fila, mostrar el diálogo de Versiones]**

**[Click en el botón "Descargar seleccionados (.zip)"]**

> "Y algo muy pedido: podés seleccionar varios documentos y bajarlos
> todos juntos en un ZIP. Útil para entregarle todo un paquete al
> cliente."

---

## 3. Kanban (4:00 – 5:30)

**[Ir al menú lateral, click en Kanban]**

> "Este es el tablero Kanban. Cada columna es un estado de las tareas
> internas del estudio — Pendiente, En curso, Hecho. Las tarjetas son
> tareas concretas: una llamada, un informe a entregar, una reunión a
> preparar."

**[Pasar el mouse por una tarjeta, mostrar la info de responsable y fecha]**

> "Cada tarjeta tiene un responsable asignado, una fecha límite, y las
> etiquetas que la categorizan. Los permisos son los mismos que en el
> resto: cada persona ve solo lo que le corresponde, y solo puede
> mover lo que tiene asignado."

**[Mostrar la grilla completa con varias tarjetas]**

> "Lo que ves acá es la vista de Administrador. Si entro como
> Colaborador, solo veo las tarjetas donde soy responsable."

---

## 4. Administración (5:30 – 6:30)

**[Ir al menú lateral, click en Administración]**

> "Por último, el módulo de Administración. Desde acá gestionás los
> usuarios del estudio y los permisos de cada rol."

**[Click en Usuarios, mostrar la lista]**

> "Acá veo todos los usuarios. Puedo invitar uno nuevo — se le manda un
> mail con un link para que ponga su contraseña. Una vez que entra, le
> asigno un rol y queda operativo."

**[Click en Roles]**

> "Los roles son cuatro: Administrador, Gerencia, Coordinador,
> Colaborador. Cada rol tiene una matriz de permisos — qué puede ver,
> crear, editar, eliminar y exportar en cada módulo. Esto se cambia
> desde acá si hace falta."

**[Click en Catálogos]**

> "Y los catálogos son las listas de valores que se usan en toda la
> app: tipos de servicio, estados, etiquetas, categorías. Todo se
> maneja desde acá, sin tocar código."

---

## 5. Cierre (6:30 – 7:00)

**[Volver a la pantalla home]**

> "En resumen: Muttu Hub te da una vista única del cliente, un
> repositorio de documentos controlado, y un tablero para coordinar
> al equipo. Todo con login, roles, y trazabilidad completa — quién
> hizo qué, cuándo.
>
> Lo que viene en la próxima entrega: poder crear y mover tarjetas
> Kanban desde la app, y el dashboard consolidado con métricas del
> pipeline.
>
> ¿Qué te parece? ¿Arrancamos con un piloto con tu equipo?"

---

## Notas para vos, no para el video

- **No mostrar el código ni la consola del navegador.** El cliente no
  quiere ver eso.
- **No prometer Kanban CRUD.** Si te preguntan por drag&drop, decir "en
  el próximo sprint".
- **Si algo se rompe en vivo** (el típico upload que falla, una
  animación que se cuelga): "Es una app en desarrollo, esto lo
  tenemos en el backlog" y seguí. No entres en pánico ni improvises
  soluciones en cámara.
- **Grabá con audio ambiente cero**. Si tenés un ventilador cerca,
  apagalo. La cámara del celular en un estante apuntando a la pantalla
  funciona perfecto, no hace falta setup profesional.
- **Si el cliente te pide dejarle una copia** para probar: el repo es
  privado, no se la des. Lo que sí podés es darle acceso a un deploy
  público cuando esté listo. Hoy no hay deploy público — solo local.
