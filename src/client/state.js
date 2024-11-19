import { reactive } from "vue"

export default reactive({
  schemes: [],
  loading: true,
  loadingPhase: 0,
  error: false,
  titleName: "",
  subjects: [],
  mappings: [],
  suggestions: [],
  suggestionSchemes: {},
  suggestionTypes: {},
})
