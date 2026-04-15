import { Router } from 'express'
import { authMiddleware, adminOnly, adminOrStore } from '../middleware/auth.js'
import {
  getWeightPresets,
  createWeightPreset,
  updateWeightPreset,
  deleteWeightPreset,
} from '../controllers/weightPresetsController.js'

const router = Router()

// Admin + Store pueden listar (para el dropdown del formulario de nuevo despacho)
router.get('/',      authMiddleware, adminOrStore, getWeightPresets)

// Solo admin puede crear / actualizar / eliminar (SUPER_ADMIN)
router.post('/',     authMiddleware, adminOnly, createWeightPreset)
router.put('/:id',   authMiddleware, adminOnly, updateWeightPreset)
router.delete('/:id',authMiddleware, adminOnly, deleteWeightPreset)

export default router
