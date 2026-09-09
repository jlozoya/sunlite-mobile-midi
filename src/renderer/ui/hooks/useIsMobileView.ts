import { useEffect, useState } from "react"

const MOBILE_USER_AGENT = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
const MOBILE_MEDIA_QUERY = "(max-width: 760px)"

function detectMobileView(): boolean {
  return (
    MOBILE_USER_AGENT.test(window.navigator.userAgent) ||
    window.matchMedia(MOBILE_MEDIA_QUERY).matches
  )
}

export function useIsMobileView() {
  const [isMobileView, setIsMobileView] = useState(detectMobileView)

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)

    function updateIsMobileView() {
      setIsMobileView(detectMobileView())
    }

    updateIsMobileView()
    mediaQuery.addEventListener("change", updateIsMobileView)

    return () => mediaQuery.removeEventListener("change", updateIsMobileView)
  }, [])

  return isMobileView
}
