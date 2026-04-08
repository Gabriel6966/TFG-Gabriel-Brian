import {defineStore} from 'pinia'
import {ref,computed} from 'vue'

export const CartStore= defineStore('cart',()=>{
    const currentTableID=ref<number | null>(null)
    const items = ref<any[]>([])

    const totalItems = computed(()=>
    items.value.reduce((acc,item)=>
    acc + item.quantity,0))

    const totalPrice= computed(()=>{
        return items.value.reduce((acc,item)=>acc+(item.price*item.quantity),0)
    })

    //Logic actions
    const setTable = (tableId:number)=>{
        currentTableID.value=tableId
    }

    const addToCart=(product:any)=>{
        const existItem = items.value.find(item=>
            item.id===product.id
        )
        if(existItem){
            existItem.quantity++
        }else{
            items.value.push({
                ...product,
                quantity:1,
                notes:'' //Personalizated notes
            })
        }
    }
    
    const clear = ()=>{
        items.value=[]
        currentTableID.value=null
    }

    //Check to export all so others files can read values
    return{items,currentTableID,totalItems,totalPrice,addToCart,setTable,clear}
})