import { createFileRoute } from '@tanstack/react-router'
import { Game } from '../components/Game'

// /go — skip setup and launch straight into a four-player auto game
export const Route = createFileRoute('/go')({ component: () => <Game autoStart /> })
