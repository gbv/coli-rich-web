export function isAuthorized(user, config) {
  return config.allowedUsers.includes(user?.uri) || !!config.allowedProviders.find(provider => user?.identities[provider]?.id)
}
