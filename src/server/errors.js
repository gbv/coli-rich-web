
export class UnauthorizedAccessError extends Error {
  constructor(message) {
    const prefLabel = message ? { en: message } : {
      en: "Access is not authorized.",
      de: "Zugriff nicht authorisiert.",
    }
    message = message || prefLabel.en
    super(message)
    this.statusCode = 401
    this.prefLabel = prefLabel
  }
}

export class ForbiddenAccessError extends Error {
  constructor(message) {
    const prefLabel = message ? { en: message } : {
      en: "Access is forbidden.",
      de: "Zugriff nicht erlaubt.",
    }
    message = message || prefLabel.en
    super(message)
    this.statusCode = 403
    this.prefLabel = prefLabel
  }
}

export class EntityNotFoundError extends Error {
  constructor(message, id) {
    const prefLabel = message ? { en: message } : {
      en: `The requested entity ${id} could not be found.`,
      de: `Die abgefragte Entität ${id} konnte nicht gefunden werden.`,
    }
    message = message || prefLabel.en
    super(message)
    this.statusCode = 404
    this.prefLabel = prefLabel
  }
}

export class BackendError extends Error {
  constructor(message) {
    const prefLabel = message ? { en: message } : {
      en: "There was an unknown error with the backend.",
      de: "Es gab einen unbekannten Backend-Fehler.",
    }
    message = message || prefLabel.en
    super(message)
    this.statusCode = 500
    this.prefLabel = prefLabel
  }
}

export class NotImplementedError extends Error {
  constructor(message) {
    const prefLabel = message ? { en: message } : {
      en: "Not yet implemented.",
      de: "Funktion noch nicht implementiert.",
    }
    message = message || prefLabel.en
    super(message)
    this.statusCode = 501
    this.prefLabel = prefLabel
  }
}
