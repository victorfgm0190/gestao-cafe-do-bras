import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Ao navegar entre telas, leva o scroll para o topo — EXCETO quando a navegação
// é "para trás/frente" (botão voltar do browser), caso em que o próprio browser
// restaura a posição de scroll anterior.
//
//   "POP"           → voltar/avançar do browser → deixa o browser restaurar.
//   "PUSH"/"REPLACE"→ navegação nova → sobe para o topo.
export default function ScrollToTop() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (navigationType !== 'POP') {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [pathname, navigationType])

  return null
}
