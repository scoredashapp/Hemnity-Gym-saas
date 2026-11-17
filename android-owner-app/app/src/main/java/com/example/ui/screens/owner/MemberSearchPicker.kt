package com.example.ui.screens.owner

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.domain.model.MemberRecord

/**
 * Searchable member chooser: type a name, member ID or phone and pick from all gym members.
 */
@Composable
fun MemberSearchPicker(
    members: List<MemberRecord>,
    selected: MemberRecord?,
    onSelect: (MemberRecord?) -> Unit,
    modifier: Modifier = Modifier,
    label: String = "Search member (name / ID / phone) *"
) {
    var query by remember { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }

    Column(modifier = modifier.fillMaxWidth()) {
        if (selected != null) {
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(selected.name, style = MaterialTheme.typography.titleSmall)
                        Text(
                            listOfNotNull(selected.memberCode, selected.phone, selected.planName).joinToString(" • "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(onClick = { onSelect(null); query = ""; expanded = true }) {
                        Icon(Icons.Filled.Close, contentDescription = "Change member")
                    }
                }
            }
        } else {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it; expanded = true },
                label = { Text(label) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            val q = query.trim().lowercase()
            val matches = remember(members, q) {
                if (q.isEmpty()) members.take(30)
                else members.filter {
                    it.name.lowercase().contains(q) ||
                        (it.memberCode ?: "").lowercase().contains(q) ||
                        (it.phone ?: "").contains(q)
                }.take(30)
            }
            if (members.isEmpty()) {
                Text(
                    "No members loaded yet — pull to refresh the Members tab.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp)
                )
            } else if (expanded || q.isNotEmpty()) {
                Surface(
                    tonalElevation = 2.dp,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
                ) {
                    if (matches.isEmpty()) {
                        Text("No member matches \"$query\"", modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.bodySmall)
                    } else {
                        LazyColumn(modifier = Modifier.heightIn(max = 240.dp)) {
                            items(matches, key = { it.id }) { m ->
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { onSelect(m); expanded = false }
                                        .padding(horizontal = 12.dp, vertical = 8.dp),
                                    verticalArrangement = Arrangement.spacedBy(2.dp)
                                ) {
                                    Text(m.name, style = MaterialTheme.typography.bodyMedium)
                                    Text(
                                        listOfNotNull(m.memberCode, m.phone).joinToString(" • "),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                HorizontalDivider()
                            }
                        }
                    }
                }
            }
        }
    }
}
