# 🍔 EasyOrder - Gestión de Comandas Inteligente

Bienvenido al repositorio oficial de **EasyOrder**, nuestro Trabajo de Fin de Grado (TFG) para el ciclo de Desarrollo de Aplicaciones Multiplataforma (DAM). 

Esta aplicación está diseñada bajo el enfoque *Mobile First* para facilitar a los camareros la gestión de mesas y pedidos en tiempo real dentro del restaurante.

---

## ✨ Estado Actual del Proyecto (Features)
1. **Pantalla de Login (`/`):** Interfaz de acceso con validación de formulario básica.
2. **Mapa de Mesas (`/tables`):** Cuadrícula responsive (2 columnas en móvil) que muestra el estado de las mesas en tiempo real.
3. **Menú de Productos (`/menu/:id`):** Pantalla dinámica con scroll horizontal de categorías y catálogo de productos filtrables.

---

## 🛠️ Stack Tecnológico
* **Frontend:** Vue 3 (Composition API) + TypeScript
* **Build Tool:** Vite
* **Enrutamiento:** Vue Router
* **Gestión de Estado:** Pinia
* **Nativización Móvil:** Capacitor

---

## 🚀 Cómo empezar (Guía de Instalación Completa)

Si vas a configurar el entorno de trabajo por primera vez, asegúrate de tener instalado Node.js y ejecuta todos estos comandos juntos en tu terminal:

```bash
git clone [https://github.com/Gabriel6966/TFG-Gabriel-Brian.git](https://github.com/Gabriel6966/TFG-Gabriel-Brian.git)
cd TFG-Gabriel-Brian
npm install
npm install vue-router pinia
npm install @capacitor/core
npm install -D @capacitor/cli
