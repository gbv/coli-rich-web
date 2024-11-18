import state from "../state.js"
import { onMounted, onUnmounted } from "vue"

function initializeFromUrl() {
  // Get PPN parameter from URL
  const urlParams = new URLSearchParams(window.location.search)
  state.ppn = urlParams.get("ppn") || null
}

function updateUrl({ ppn } = {}) {
  const hash = window.location.hash
  const urlParams = new URLSearchParams(window.location.search)
  if ((urlParams.get("ppn") || null) === ppn) {
    return
  }
  if (ppn) {
    urlParams.set("ppn", ppn)
  } else {
    urlParams.delete("ppn")
  }
  // Build new URL
  let url = `${window.location.href.replace(hash, "").replace(window.location.search, "")}`
  if (urlParams.toString()) {
    url += `?${urlParams.toString()}`
  }
  // Note that hash/fragment needs to be at the end of the URL, otherwise the search params will be considered part of the hash!
  url += hash
  window.history.pushState({}, "", url)
}

export const useUrlHandling = () => {

  onMounted(() => {
    initializeFromUrl()
    addEventListener("popstate", initializeFromUrl)
  })

  onUnmounted(() => {
    removeEventListener("popstate", initializeFromUrl)
  })

  return {
    initializeFromUrl,
    updateUrl,
  }
}
