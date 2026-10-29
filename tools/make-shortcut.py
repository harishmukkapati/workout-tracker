#!/usr/bin/env python3
"""Builds the "Save to Apple Health" iPhone Shortcut (unsigned).

    python3 tools/make-shortcut.py "http://192.168.1.20:47821/export?key=YOURKEY" out.shortcut

The URL is built into the shortcut. To change it later, edit the Get Contents of URL step.
iPhones only import signed shortcuts, so sign it on a Mac first:

    shortcuts sign --mode anyone --input out.shortcut --output "Save to Apple Health.shortcut"

It reads /export?hold from Workout Tracker (1.9.3 or newer) and logs:
workouts as Traditional Strength Training, Beat Saber as Mixed Cardio, each day's food as
nutrition samples, and weigh-ins as body weight. Only after everything is saved does it call
/export?done=<receipt>, so a failed run leaves the items waiting for next time.
"""
import plistlib
import sys
import uuid

url = sys.argv[1] if len(sys.argv) > 1 else 'http://YOUR-PC-IP:47821/export?key=YOUR-KEY'
out = sys.argv[2] if len(sys.argv) > 2 else 'Save to Apple Health (unsigned).shortcut'

actions = []


def new_id():
    return str(uuid.uuid4()).upper()


def add(ident, params):
    actions.append({'WFWorkflowActionIdentifier': 'is.workflow.actions.' + ident, 'WFWorkflowActionParameters': params})


def output_ref(ref):
    uid, name = ref
    return {'OutputUUID': uid, 'OutputName': name, 'Type': 'ActionOutput'}


def attach(ref):
    return {'Value': output_ref(ref), 'WFSerializationType': 'WFTextTokenAttachment'}


REPEAT_ITEM = {'Value': {'Type': 'Variable', 'VariableName': 'Repeat Item'}, 'WFSerializationType': 'WFTextTokenAttachment'}


def get_value(source, key, name):
    """Get Dictionary Value: Value for `key` in `source`, renamed `name`. Returns a reference to its output."""
    uid = new_id()
    add('getvalueforkey', {
        'UUID': uid,
        'WFInput': source,
        'WFDictionaryKey': key,
        'WFGetDictionaryValueType': 'Value',
        'CustomOutputName': name,
    })
    return (uid, name)


def date_text(ref):
    """A date field holding a variable, the way the Shortcuts editor saves it (text with one token).
    Workout Tracker sends `when` as "October 26, 2026 at 4:31 PM", which the field reads directly."""
    return {'Value': {'string': '\ufffc', 'attachmentsByRange': {'{0, 1}': output_ref(ref)}}, 'WFSerializationType': 'WFTextTokenString'}


def qty(ref, unit):
    return {'Value': {'Magnitude': output_ref(ref), 'Unit': unit}, 'WFSerializationType': 'WFQuantityFieldValue'}


def repeat_each(list_ref, body):
    group = new_id()
    add('repeat.each', {'GroupingIdentifier': group, 'WFControlFlowMode': 0, 'WFInput': attach(list_ref)})
    body()
    add('repeat.each', {'GroupingIdentifier': group, 'WFControlFlowMode': 2, 'UUID': new_id()})


def comment(text):
    add('comment', {'WFCommentActionText': text})


# 1. Ask Workout Tracker what's new. Nothing is marked sent until step 6 confirms.
comment('Asks Workout Tracker on your PC or Mac for anything new. Your iPhone has to be on the same Wi-Fi, with the app open or in the tray.')
fetch = (new_id(), 'Contents of URL')
add('downloadurl', {'UUID': fetch[0], 'WFURL': url + '&hold', 'WFHTTPMethod': 'GET'})
fetched = attach(fetch)


def workouts(key, label, activity):
    lst = get_value(fetched, key, label)

    def body():
        start = get_value(REPEAT_ITEM, 'when', 'Start')
        minutes = get_value(REPEAT_ITEM, 'minutes', 'Minutes')
        kcal = get_value(REPEAT_ITEM, 'kcal', 'Calories')
        add('health.workout.log', {
            'UUID': new_id(),
            'WFWorkoutReadableActivityType': activity,
            'WFWorkoutDate': date_text(start),
            'WFWorkoutDuration': qty(minutes, 'min'),
            'WFWorkoutCaloriesQuantity': qty(kcal, 'kcal'),
        })
    repeat_each(lst, body)


# 2. Lifting sessions and Beat Saber
comment('Lifting sessions')
workouts('workouts', 'Workouts', 'Traditional Strength Training')
comment('Beat Saber')
workouts('cardio', 'Cardio', 'Mixed Cardio')

# 3. Food, one entry per finished day
comment("Food: each finished day's totals")
food = get_value(fetched, 'food', 'Food')
# Types use the Health app's English names (what the Log Health Sample picker shows).
NUTRIENTS = [
    ('kcal', 'Dietary Energy', 'kcal', 'Calories Eaten'),
    ('protein', 'Protein', 'g', 'Protein'),
    ('carbs', 'Carbohydrates', 'g', 'Carbs'),
    ('fat', 'Total Fat', 'g', 'Fat'),
    ('fiber', 'Fiber', 'g', 'Fiber'),
    ('sugar', 'Dietary Sugar', 'g', 'Sugar'),
    ('sodium', 'Sodium', 'mg', 'Sodium'),
    ('water_ml', 'Water', 'mL', 'Water'),
]


def food_body():
    when = get_value(REPEAT_ITEM, 'when', 'Day')
    for key, sample, unit, name in NUTRIENTS:
        v = get_value(REPEAT_ITEM, key, name)
        add('health.quantity.log', {
            'UUID': new_id(),
            'WFQuantitySampleType': sample,
            'WFQuantitySampleQuantity': qty(v, unit),
            'WFQuantitySampleDate': date_text(when),
        })


repeat_each(food, food_body)

# 4. Weigh-ins typed into the app
comment('Weigh-ins')
weights = get_value(fetched, 'weights', 'Weigh-ins')


def weight_body():
    when = get_value(REPEAT_ITEM, 'when', 'Weighed')
    lb = get_value(REPEAT_ITEM, 'lb', 'Pounds')
    add('health.quantity.log', {
        'UUID': new_id(),
        'WFQuantitySampleType': 'Weight',
        'WFQuantitySampleQuantity': qty(lb, 'lb'),
        'WFQuantitySampleDate': date_text(when),
    })


repeat_each(weights, weight_body)

# 5. Everything is in Health: tell Workout Tracker, so these items aren't sent again.
comment('Everything above saved, so tell Workout Tracker not to send these again. If a step fails, the shortcut stops here and the items stay waiting.')
receipt = get_value(fetched, 'receipt', 'Receipt')
prefix = url + '&done='
add('downloadurl', {
    'UUID': new_id(),
    'WFHTTPMethod': 'GET',
    'WFURL': {
        'Value': {'string': prefix + '\ufffc', 'attachmentsByRange': {'{%d, 1}' % len(prefix): output_ref(receipt)}},
        'WFSerializationType': 'WFTextTokenString',
    },
})

# 6. Say how many were saved
count = get_value(fetched, 'count', 'Count')
add('notification', {
    'WFNotificationActionTitle': 'Workout Tracker',
    'WFNotificationActionBody': {
        'Value': {'string': 'Saved ￼ item(s) to Apple Health.', 'attachmentsByRange': {'{6, 1}': output_ref(count)}},
        'WFSerializationType': 'WFTextTokenString',
    },
    'WFNotificationActionSound': False,
})

shortcut = {
    'WFWorkflowClientVersion': '3218.0.4.100',
    'WFWorkflowMinimumClientVersion': 900,
    'WFWorkflowMinimumClientVersionString': '900',
    'WFWorkflowIcon': {'WFWorkflowIconStartColor': 4282601983, 'WFWorkflowIconGlyphNumber': 59754},
    'WFWorkflowTypes': [],
    'WFQuickActionSurfaces': [],
    'WFWorkflowHasShortcutInputVariables': False,
    'WFWorkflowHasOutputFallback': False,
    'WFWorkflowInputContentItemClasses': [
        'WFAppStoreAppContentItem', 'WFArticleContentItem', 'WFContactContentItem', 'WFDateContentItem',
        'WFEmailAddressContentItem', 'WFGenericFileContentItem', 'WFImageContentItem', 'WFiTunesProductContentItem',
        'WFLocationContentItem', 'WFDCMapsLinkContentItem', 'WFAVAssetContentItem', 'WFPDFContentItem',
        'WFPhoneNumberContentItem', 'WFRichTextContentItem', 'WFSafariWebPageContentItem', 'WFStringContentItem',
        'WFURLContentItem',
    ],
    'WFWorkflowOutputContentItemClasses': [],
    'WFWorkflowImportQuestions': [],
    'WFWorkflowActions': actions,
}

assert actions[1]['WFWorkflowActionIdentifier'] == 'is.workflow.actions.downloadurl'
with open(out, 'wb') as f:
    plistlib.dump(shortcut, f, fmt=plistlib.FMT_XML)  # `shortcuts sign` wants XML
print(f'Wrote {out}: {len(actions)} actions')
