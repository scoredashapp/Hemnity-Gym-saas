package com.example.ui.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.R
import com.example.ui.theme.AccentOrange
import com.example.ui.theme.CardBorderSubtle
import com.example.ui.theme.ElevatedSurface
import com.example.ui.theme.OrangeContainerDark
import com.example.ui.theme.PrimaryBackground
import com.example.ui.theme.PrimaryOrange
import com.example.ui.theme.PrimaryText
import com.example.ui.theme.SecondaryBackground
import com.example.ui.theme.SecondaryText
import com.example.ui.theme.StatusActive
import com.example.ui.theme.StatusActiveContainer
import com.example.ui.theme.StatusExpired
import com.example.ui.theme.StatusExpiredContainer

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    authViewModel: AuthViewModel,
    onLoginSuccess: () -> Unit,
) {
    val state by authViewModel.loginState.collectAsStateWithLifecycle()
    val loginSucceeded by authViewModel.loginSuccessEvent.collectAsStateWithLifecycle()
    val focusManager = LocalFocusManager.current

    LaunchedEffect(loginSucceeded) {
        if (loginSucceeded) {
            authViewModel.consumeLoginSuccess()
            onLoginSuccess()
        }
    }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = PrimaryOrange,
        unfocusedBorderColor = CardBorderSubtle,
        focusedContainerColor = ElevatedSurface,
        unfocusedContainerColor = ElevatedSurface,
        cursorColor = PrimaryOrange,
        focusedTextColor = PrimaryText,
        unfocusedTextColor = PrimaryText,
        focusedLabelColor = PrimaryOrange,
        unfocusedLabelColor = SecondaryText,
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(PrimaryBackground, Color(0xFF121218), PrimaryBackground)
                )
            )
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 520.dp)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painter = painterResource(id = R.drawable.hemnity_logo),
                contentDescription = stringResource(R.string.app_name),
                modifier = Modifier
                    .size(88.dp)
                    .clip(RoundedCornerShape(22.dp)),
            )

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(OrangeContainerDark)
                    .padding(horizontal = 12.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Shield,
                    contentDescription = null,
                    tint = AccentOrange,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = stringResource(R.string.login_members_only_badge),
                    style = MaterialTheme.typography.labelMedium,
                    color = AccentOrange,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            Text(
                text = stringResource(R.string.login_title),
                style = MaterialTheme.typography.displaySmall,
                color = PrimaryText,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = stringResource(R.string.login_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = SecondaryText,
            )

            Spacer(modifier = Modifier.height(24.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
                border = BorderStroke(1.dp, CardBorderSubtle),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    AnimatedVisibility(visible = !state.errorMessage.isNullOrBlank()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(StatusExpiredContainer)
                                .padding(12.dp)
                                .testTag("login_error_banner"),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.ErrorOutline,
                                contentDescription = "Error",
                                tint = StatusExpired,
                                modifier = Modifier.size(20.dp),
                            )
                            Text(
                                text = state.errorMessage.orEmpty(),
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFFFCA5A5),
                            )
                        }
                    }

                    OutlinedTextField(
                        value = state.identifier,
                        onValueChange = authViewModel::onIdentifierChanged,
                        label = { Text(stringResource(R.string.login_identifier_label)) },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Rounded.Email,
                                contentDescription = null,
                                tint = SecondaryText,
                            )
                        },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next,
                        ),
                        keyboardActions = KeyboardActions(
                            onNext = { focusManager.moveFocus(FocusDirection.Down) }
                        ),
                        shape = RoundedCornerShape(14.dp),
                        colors = fieldColors,
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("login_identifier_input"),
                    )

                    OutlinedTextField(
                        value = state.password,
                        onValueChange = authViewModel::onPasswordChanged,
                        label = { Text(stringResource(R.string.login_password_label)) },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Rounded.Lock,
                                contentDescription = null,
                                tint = SecondaryText,
                            )
                        },
                        trailingIcon = {
                            IconButton(
                                onClick = authViewModel::togglePasswordVisibility,
                                modifier = Modifier.testTag("toggle_password_visibility"),
                            ) {
                                Icon(
                                    imageVector = if (state.passwordVisible) {
                                        Icons.Rounded.VisibilityOff
                                    } else {
                                        Icons.Rounded.Visibility
                                    },
                                    contentDescription = if (state.passwordVisible) {
                                        "Hide password"
                                    } else {
                                        "Show password"
                                    },
                                    tint = SecondaryText,
                                )
                            }
                        },
                        visualTransformation = if (state.passwordVisible) {
                            VisualTransformation.None
                        } else {
                            PasswordVisualTransformation()
                        },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done,
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = {
                                focusManager.clearFocus()
                                authViewModel.submitLogin()
                            }
                        ),
                        shape = RoundedCornerShape(14.dp),
                        colors = fieldColors,
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("login_password_input"),
                    )

                    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                        TextButton(
                            onClick = authViewModel::openForgotPassword,
                            modifier = Modifier.testTag("forgot_password_button"),
                        ) {
                            Text(
                                text = stringResource(R.string.login_forgot_password),
                                color = AccentOrange,
                                style = MaterialTheme.typography.labelLarge,
                            )
                        }
                    }

                    Button(
                        onClick = {
                            focusManager.clearFocus()
                            authViewModel.submitLogin()
                        },
                        enabled = !state.isLoading,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp)
                            .testTag("login_button"),
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = PrimaryOrange,
                            contentColor = Color.White,
                            disabledContainerColor = PrimaryOrange.copy(alpha = 0.5f),
                        ),
                    ) {
                        if (state.isLoading) {
                            CircularProgressIndicator(
                                color = Color.White,
                                strokeWidth = 2.5.dp,
                                modifier = Modifier.size(22.dp),
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Text("Signing In...", fontWeight = FontWeight.SemiBold)
                        } else {
                            Text(
                                text = stringResource(R.string.login_button),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(18.dp))
            Text(
                text = "Connected securely via HTTPS to gym.hemnity.in",
                style = MaterialTheme.typography.bodySmall,
                color = SecondaryText,
            )
        }
    }

    if (state.forgotSheetOpen) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = authViewModel::closeForgotPassword,
            sheetState = sheetState,
            containerColor = SecondaryBackground,
            contentColor = PrimaryText,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 16.dp)
                    .navigationBarsPadding(),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text(
                    text = "Reset Member Password",
                    style = MaterialTheme.typography.headlineMedium,
                    color = PrimaryText,
                )
                Text(
                    text = "Enter your registered email or mobile number. If your gym has enabled self-service reset, instructions will be sent.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = SecondaryText,
                )

                OutlinedTextField(
                    value = state.forgotIdentifier,
                    onValueChange = authViewModel::onForgotIdentifierChanged,
                    label = { Text("Registered Email or Mobile") },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    colors = fieldColors,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("forgot_identifier_input"),
                )

                if (!state.forgotError.isNullOrBlank()) {
                    Text(
                        text = state.forgotError.orEmpty(),
                        style = MaterialTheme.typography.bodySmall,
                        color = StatusExpired,
                    )
                }
                if (!state.forgotFeedback.isNullOrBlank()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(StatusActiveContainer)
                            .padding(12.dp)
                    ) {
                        Text(
                            text = state.forgotFeedback.orEmpty(),
                            style = MaterialTheme.typography.bodySmall,
                            color = StatusActive,
                        )
                    }
                }

                Button(
                    onClick = authViewModel::submitForgotPassword,
                    enabled = !state.forgotLoading,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                        .testTag("forgot_submit_button"),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryOrange),
                ) {
                    if (state.forgotLoading) {
                        CircularProgressIndicator(
                            color = Color.White,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(20.dp),
                        )
                    } else {
                        Text("Send Reset Instructions", fontWeight = FontWeight.SemiBold)
                    }
                }
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }
}
