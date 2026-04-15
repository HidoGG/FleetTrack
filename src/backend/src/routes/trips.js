import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import {
  listTrips,
  getTrip,
  startTrip,
  endTrip,
  updateLocation
} from '../controllers/tripController.js'

const router = Router()

router.use(authMiddleware)

router.get('/',            listTrips)
router.get('/:id',         getTrip)
router.post('/start',      startTrip)
router.put('/:id/end',     endTrip)
router.post('/location',   updateLocation)  // Conductor envía GPS

export default router
