import { useEffect, useState } from "react"

export function useIsMobileView() {
  const [isMobileView, setIsMobileView] = useState(false)

  useEffect(() => {
    const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent)
    const mediaQuery = window.matchMedia("(max-width: 760px)")

    function updateIsMobileView() {
      setIsMobileView(mobileUserAgent || mediaQuery.matches)
    }

    updateIsMobileView()
    mediaQuery.addEventListener("change", updateIsMobileView)

    return () => mediaQuery.removeEventListener("change", updateIsMobileView)
  }, [])

  return isMobileView
}
