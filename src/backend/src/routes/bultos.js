import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import { attachMapPolicy, requireCompanyMapAccess } from '../middleware/mapAccess.js'
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

router.use(authMiddleware)
router.use(attachMapPolicy)

// ── Rutas para rider/driver (autenticado) ─────────────────────────────────────
router.post('/validate', validateLote)
router.post('/unlock',   unlockRider)

// ── Rutas para admin ──────────────────────────────────────────────────────────
router.get('/',         adminOnly, getBultos)
router.post('/',        adminOnly, createBulto)
router.delete('/:id',   adminOnly, deleteBulto)
router.get('/blocked',       adminOnly, getBlockedRiders)
router.get('/accesos',       adminOnly, getAccesosLog)
router.get(
  '/active-orders',
  requireCompanyMapAccess({ capabilities: ['map.view.active_orders'] }),
  getActiveOrdersForVehicle,
)

export default router
