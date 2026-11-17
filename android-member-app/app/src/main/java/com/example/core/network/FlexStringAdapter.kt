package com.example.core.network

import com.squareup.moshi.FromJson
import com.squareup.moshi.JsonQualifier
import com.squareup.moshi.JsonReader
import com.squareup.moshi.JsonWriter
import com.squareup.moshi.ToJson

@Retention(AnnotationRetention.RUNTIME)
@JsonQualifier
annotation class FlexString

class FlexStringAdapter {
    @FromJson
    @FlexString
    fun fromJson(reader: JsonReader): String? {
        return when (reader.peek()) {
            JsonReader.Token.NULL -> reader.nextNull()
            JsonReader.Token.STRING, JsonReader.Token.NUMBER -> reader.nextString()
            JsonReader.Token.BOOLEAN -> reader.nextBoolean().toString()
            else -> {
                reader.skipValue()
                null
            }
        }
    }

    @ToJson
    fun toJson(writer: JsonWriter, @FlexString value: String?) {
        if (value == null) writer.nullValue() else writer.value(value)
    }
}
