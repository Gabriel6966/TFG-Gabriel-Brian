import { createRouter,createWebHistory } from "vue-router";
//Global import
const vistas = import.meta.glob('../views/*.vue')

const router = createRouter({
    history:createWebHistory(),
    routes:[
        {
            path:'/',
            name:'Login',
            component:vistas['../views/LoginView.vue']
        },
        {
            path:'/tables',
            name:'Tables',
            component:vistas['../views/MesasView.vue']
        },
        {
            path:'/menu/:id',
            name:'Menu',
            component:vistas['../views/MenuView.vue']
        },
        {
            path:'/checkout',
            name:'Checkout',
            component:vistas['../views/CheckoutView.vue']
        },
        {
            path:'/admin',
            name:'Admin',
            component:vistas['../views/AdminView.vue']
        },
        {
            path:'/kitchen',
            name:'Kitchen',
            component:vistas['../views/CocinaView.vue']
        }
    ]
})
export default router