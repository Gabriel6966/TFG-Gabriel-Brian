$files = @(
    # Núcleo
    "src/main.ts",
    "src/App.vue",
    "src/firebase.ts",
    "src/router/index.ts",
    "src/vite-env.d.ts",
    # Composables
    "src/composables/useAuth.ts",
    "src/composables/useNegocio.ts",
    "src/composables/useNotify.ts",
    "src/composables/useReservaNotify.ts",
    # Stores
    "src/stores/cart.ts",
    # Utilidades
    "src/utils/iva.ts",
    # Componentes POS
    "src/components/pos/PosFloorMap.vue",
    "src/components/pos/PosOrderPanel.vue",
    "src/components/pos/PosSidebar.vue",
    "src/components/pos/FloorEditor.vue",
    # Componentes comunes
    "src/components/AppNotifications.vue",
    "src/components/branding/PoweredByEasyOrder.vue",
    # Vistas
    "src/views/LoginView.vue",
    "src/views/RegisterView.vue",
    "src/views/MesasView.vue",
    "src/views/CocinaView.vue",
    "src/views/AdminView.vue",
    # Seguridad / config
    "firestore.rules"
)

$output = ""
foreach ($file in $files) {
    if (Test-Path $file) {
        $output += "`n`n===== $file =====`n"
        $output += Get-Content $file -Raw
    } else {
        Write-Host "⚠️ Archivo no encontrado: $file" -ForegroundColor Yellow
    }
}

$output | Set-Clipboard
Write-Host "¡Contexto copiado al portapapeles! Ya puedes pegar en la IA." -ForegroundColor Green