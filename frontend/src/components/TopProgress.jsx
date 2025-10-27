import { useEffect } from 'react'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

export default function TopProgress({ active }) {
  useEffect(() => {
    NProgress.configure({ showSpinner: false, trickleSpeed: 100 })
    if (active) NProgress.start(); else NProgress.done()
    return () => { NProgress.done() }
  }, [active])
  return <div className="topbar-progress" />
} 

