# 🏗️ Arquitectura y Flujo de Trabajo (TFG EasyOrder)

## 💻 Tech Stack
*   **Framework:** Vue 3 (Composition API con `<script setup>` y TypeScript).
*   **Estado Global:** Pinia.
*   **Backend/Base de datos:** Firebase (Firestore) en tiempo real (`onSnapshot`).
*   **Estilos:** CSS puro (scoped en componentes), sin librerías externas de UI pesadas para mantener el control total del diseño.

## 📐 Patrón de Arquitectura (Smart / Dumb Components)
Trabajamos con un enfoque de "Componente Contenedor" (Cerebro) y "Componentes Presentacionales" (Hijos).
*   **Cerebro (Ej. `MesasView.vue`):** Se encarga de la lógica pesada, comunicarse con Firebase, manejar Pinia y contener el estado global de la vista.
*   **Presentacionales (Ej. `PosSidebar.vue`, `PosFloorMap.vue`):** Solo reciben datos mediante `props` y avisan de las acciones del usuario mediante `emits`. No hablan directamente con Firebase.

## 🌿 Estrategia de Ramas (Git Flow Simplificado)
*   `main`: Código estable y funcional (Producción).
*   `feat/nombre-funcionalidad`: Ramas para desarrollo de nuevas características (ej. `feat/pos-interactive-map`).
*   `fix/nombre-error`: Ramas para corregir bugs aislados.
*   **Flujo:** Se desarrolla en la rama `feat/`, se hace `commit`, `push` y se fusiona mediante Pull Request hacia `main`.

## 🤖 Reglas estables para la IA
*   No modificar nombres de variables reactivas ni funciones existentes a menos que se pida explícitamente.
*   Mantener el tipado estricto de TypeScript.
*   Respetar los nombres de los campos de Firestore (ej. `capacidad`, `estado`, `numero`).