import { suggestionsToPica } from "@/utils.js"
import { inject, ref } from "vue"
import { baseUrl } from "@/config.js"
import * as jskos from "jskos-tools"

export function useSubmitEnrichments() {
  const { token } = inject("login-refs")
  const successMessage = ref(""), errorMessage = ref(""), submitLoading = ref(false)

  function resetSubmit() {
    successMessage.value = ""
    errorMessage.value = ""
    submitLoading.value = false
  }

  async function submitEnrichments(ppn, suggestions) {
    resetSubmit()
    submitLoading.value = true
    const pica = suggestionsToPica({ ppn, suggestions })
    const options = {
      method: "post",
      headers: token ? {
        Authorization: `Bearer ${token.value}`,
      } : {},
      body: pica,
    }
    try {
      const response = await fetch(baseUrl + "enrichment", options)
      const data = await response.json()
      if (response.status === 201) {
        successMessage.value = "Anreicherung wurde erfolgreich vorgemerkt."
      } else {
        errorMessage.value = `${data.error}: ${jskos.prefLabel(data) || data.message}`
      }
    } catch (error) {
      errorMessage.value = `${error.name}: ${error.message}`
    }
    submitLoading.value = false
    return successMessage.value !== ""
  }

  return {
    submitEnrichments,
    successMessage,
    errorMessage,
    submitLoading,
    resetSubmit,
  }
}

