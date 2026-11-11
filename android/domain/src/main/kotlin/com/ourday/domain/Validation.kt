package com.ourday.domain

object Validation {
    private val email = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$")
    fun isValidEmail(s: String): Boolean = email.matches(s.trim())
    fun passwordOk(s: String): Boolean = s.length >= 8

    sealed interface Result { data object Ok : Result; data class Error(val message: String) : Result }

    fun signIn(emailText: String, password: String): Result = when {
        !isValidEmail(emailText) -> Result.Error("Enter a valid email address.")
        password.isEmpty() -> Result.Error("Enter your password.")
        else -> Result.Ok
    }

    fun signUp(name: String, emailText: String, password: String): Result = when {
        name.isBlank() -> Result.Error("Tell us your name.")
        name.trim().length > 60 -> Result.Error("Use a shorter name (60 characters or fewer).")
        !isValidEmail(emailText) -> Result.Error("Enter a valid email address.")
        !passwordOk(password) -> Result.Error("Choose a password with at least 8 characters.")
        else -> Result.Ok
    }

    fun taskTitle(s: String): Result = when {
        s.isBlank() -> Result.Error("Give your task a title.")
        s.trim().length > 200 -> Result.Error("Keep the title under 200 characters.")
        else -> Result.Ok
    }

    fun habitTitle(s: String): Result = when {
        s.isBlank() -> Result.Error("Give your habit a name.")
        s.trim().length > 120 -> Result.Error("Keep the name under 120 characters.")
        else -> Result.Ok
    }
}
