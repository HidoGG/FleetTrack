import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import {
  validateLote,
  unlockRider,
  getBultos,
  createBulto,
  deleteBulto,
  getBlockedRiders,
  getAccesosLog,
  getActiveOrdersForVehicle,
} from '../controllers/bultosController.js'

const router = Router()

// ── Rutas para rider/driver (autenticado) ─────────────────────────────────────
router.post('/validate', authMiddleware, validateLote)
router.post('/unlock',   authMiddleware, unlockRider)

// ── Rutas para admin ──────────────────────────────────────────────────────────
router.get('/',         authMiddleware, adminOnly, getBultos)
router.post('/',        authMiddleware, adminOnly, createBulto)
router.delete('/:id',   authMiddleware, adminOnly, deleteBulto)
router.get('/blocked',       authMiddleware, adminOnly, getBlockedRiders)
router.get('/accesos',       authMiddleware, adminOnly, getAccesosLog)
router.get('/active-orders', authMiddleware, adminOnly, getActiveOrdersForVehicle)

export default router
