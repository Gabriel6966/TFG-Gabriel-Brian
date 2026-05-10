$files = @(
    "src/firebase.ts",
    "src/main.ts",
    "src/router/index.ts",
    "src/composables/useAuth.ts",
    "src/stores/cart.ts",
    "src/components/pos/PosFloorMap.vue",
    "src/components/pos/PosOrderPanel.vue",
    "src/components/pos/PosSidebar.vue",
    "src/components/pos/FloorEditor.vue",
    "src/views/LoginView.vue",
    "src/views/RegisterView.vue",
    "src/views/MesasView.vue",
    "src/views/CocinaView.vue",
    "src/views/AdminView.vue",
    "src/views/MenuView.vue",
    "src/views/CheckoutView.vue"
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