import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import { getStores, createStore, updateStore, deleteStore } from '../controllers/storesController.js'

const router = Router()

router.get('/',      authMiddleware, getStores)
router.post('/',     authMiddleware, adminOnly, createStore)
router.put('/:id',   authMiddleware, adminOnly, updateStore)
router.delete('/:id',authMiddleware, adminOnly, deleteStore)

export default router
