import { onMounted, onUnmounted, ref } from "vue"

export function useGoToTop() {

  const showGoToTopButton = ref(false)

  function handleScroll() {
    if (document.documentElement.scrollTop < 50) {
      showGoToTopButton.value = false
    } else {
      showGoToTopButton.value = true
    }
  }

  onMounted(() => {
    window.addEventListener("scroll", handleScroll)
  })
  onUnmounted(() => {
    window.removeEventListener("scroll", handleScroll)
  })
  
  return {
    showGoToTopButton,
    goToTop: () => {
      window.scrollTo(0, 0)
    },
  }
}
